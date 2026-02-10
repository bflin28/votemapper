#!/usr/bin/env python3
"""
TX Secretary of State candidate filing scraper.

Scrapes candidate.texas-election.com for current election cycle filings.
Extracts candidate name, office, party, county and outputs to CSV.

Usage:
    pip install playwright playwright-stealth
    playwright install chromium
    python scripts/scrape_tx_candidates.py
    python scripts/scrape_tx_candidates.py --election-date 2026-05-02 --output data/tx-candidates-2026.csv

The browser opens headed so you can handle any CAPTCHAs or navigation issues.
"""

import argparse
import csv
import os
import re
import sys
import time
from datetime import datetime

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
except ImportError:
    print("Install playwright: pip install playwright && playwright install chromium")
    sys.exit(1)

try:
    from playwright_stealth import stealth_sync
    HAS_STEALTH = True
except ImportError:
    HAS_STEALTH = False

# TX SoS candidate search page
CANDIDATE_URL = "https://candidate.texas-election.com/Elections/getraces.do"

# Small TX counties (< ~10k population) — good targets for local campaigns
SMALL_COUNTIES = [
    "Armstrong", "Borden", "Briscoe", "Carson", "Childress", "Cochran",
    "Collingsworth", "Cottle", "Crosby", "Dallam", "Dickens", "Donley",
    "Floyd", "Foard", "Garza", "Glasscock", "Hall", "Hansford",
    "Hardeman", "Hartley", "Hemphill", "Irion", "Kent", "King",
    "Knox", "Lipscomb", "Loving", "McMullen", "Menard", "Motley",
    "Oldham", "Roberts", "Sherman", "Sterling", "Stonewall", "Swisher",
    "Throckmorton", "Wheeler",
]

# Office types that are good for door-knocking campaigns
TARGET_OFFICES = [
    "county judge", "commissioner", "constable", "sheriff",
    "justice of the peace", "city council", "mayor", "school board",
    "city marshal", "alderman",
]


def parse_candidate_table(page):
    """Parse the candidate results table on the TX SoS page.

    Returns list of dicts with: name, office, party, county, election_date
    """
    candidates = []

    # Look for results table
    table = page.query_selector("table.resultsTable") or page.query_selector("table")
    if not table:
        print("No results table found on page.")
        return candidates

    rows = table.query_selector_all("tr")
    headers = []

    for row in rows:
        cells = row.query_selector_all("th")
        if cells:
            headers = [c.text_content().strip().lower() for c in cells]
            continue

        cells = row.query_selector_all("td")
        if not cells:
            continue

        cell_data = [c.text_content().strip() for c in cells]
        if not any(cell_data):
            continue

        # Map cells to fields based on header positions
        candidate = {}
        for i, val in enumerate(cell_data):
            if i < len(headers):
                candidate[headers[i]] = val
            else:
                candidate[f"col_{i}"] = val

        candidates.append(candidate)

    return candidates


def normalize_candidate(raw, election_date=None):
    """Normalize a raw candidate dict into our standard format."""
    # Try common TX SoS column names
    name = (
        raw.get("candidate name", "") or
        raw.get("name", "") or
        raw.get("candidate", "")
    ).strip()

    office = (
        raw.get("office", "") or
        raw.get("race", "") or
        raw.get("position", "")
    ).strip()

    party = (
        raw.get("party", "") or
        raw.get("party affiliation", "")
    ).strip()

    county = (
        raw.get("county", "") or
        raw.get("district", "")
    ).strip()

    # Clean up party abbreviations
    party_map = {"R": "Republican", "D": "Democrat", "L": "Libertarian", "G": "Green", "I": "Independent"}
    if party.upper() in party_map:
        party = party_map[party.upper()]

    return {
        "name": name,
        "office": office,
        "party": party,
        "county": county,
        "state": "TX",
        "election_date": election_date or "",
        "election_type": "primary",
        "source_url": CANDIDATE_URL,
    }


def is_target_candidate(candidate, filter_counties=True, filter_offices=True, target_counties=None):
    """Check if a candidate matches our targeting criteria."""
    if filter_counties and candidate["county"]:
        counties_list = target_counties if target_counties else SMALL_COUNTIES
        county_match = any(
            c.lower() in candidate["county"].lower()
            for c in counties_list
        )
        if not county_match:
            return False

    if filter_offices and candidate["office"]:
        office_match = any(
            t in candidate["office"].lower()
            for t in TARGET_OFFICES
        )
        if not office_match:
            return False

    return True


def save_candidates_csv(candidates, output_path):
    """Save candidates to CSV."""
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    fieldnames = [
        "name", "office", "party", "county", "state",
        "election_date", "election_type", "source_url",
    ]

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for c in candidates:
            writer.writerow({k: c.get(k, "") for k in fieldnames})

    print(f"\nSaved {len(candidates)} candidates to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Scrape TX SoS candidate filings")
    parser.add_argument("--election-date", default=None,
                        help="Election date (YYYY-MM-DD), e.g. 2026-05-02")
    parser.add_argument("--output", default=None,
                        help="Output CSV path")
    parser.add_argument("--county", default=None,
                        help="Comma-separated county names to filter (e.g. 'Falls,Armstrong')")
    parser.add_argument("--all-counties", action="store_true",
                        help="Include all counties, not just small ones")
    parser.add_argument("--all-offices", action="store_true",
                        help="Include all offices, not just local campaign targets")
    args = parser.parse_args()

    # Parse --county flag into a list
    target_counties = None
    if args.county:
        target_counties = [c.strip() for c in args.county.split(",") if c.strip()]

    year = datetime.now().year
    output_path = args.output or f"data/tx-candidates-{year}.csv"

    print(f"TX Candidate Scraper")
    print(f"  Output: {output_path}")
    if target_counties:
        print(f"  Filtering to counties: {', '.join(target_counties)}")
    elif not args.all_counties:
        print(f"  Filtering to {len(SMALL_COUNTIES)} small counties")
    if not args.all_offices:
        print(f"  Filtering to local office types")
    print()

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        )
        page = context.new_page()

        if HAS_STEALTH:
            stealth_sync(page)

        print("Navigating to TX SoS candidate search...")
        page.goto(CANDIDATE_URL, timeout=30000)
        time.sleep(2)

        print("\n" + "=" * 60)
        print("The TX SoS candidate search page is open.")
        print("")
        print("Steps:")
        print("  1. Select the election/date you want to search")
        print("  2. Click 'Search' or 'Submit' to load results")
        print("  3. When the candidate results TABLE is visible,")
        print("     press Enter here to scrape.")
        print("=" * 60)
        input("\nPress Enter when results are visible...")

        # Scrape candidates
        print("\nScraping candidate table...")
        all_candidates = []

        # Scrape current page
        raw_candidates = parse_candidate_table(page)
        print(f"Found {len(raw_candidates)} raw entries on this page.")

        # Try pagination
        page_num = 1
        while True:
            for raw in raw_candidates:
                candidate = normalize_candidate(raw, args.election_date)
                if candidate["name"]:
                    all_candidates.append(candidate)

            # Look for next page link
            next_link = page.query_selector("a:has-text('Next')") or page.query_selector("a:has-text('>')")
            if next_link and next_link.is_visible():
                try:
                    next_link.click()
                    time.sleep(2)
                    page_num += 1
                    print(f"Scraping page {page_num}...")
                    raw_candidates = parse_candidate_table(page)
                    if not raw_candidates:
                        break
                except Exception:
                    break
            else:
                break

        print(f"\nTotal raw candidates: {len(all_candidates)}")

        browser.close()

    # Filter candidates
    filter_counties = bool(target_counties) or not args.all_counties
    filter_offices = not args.all_offices

    if filter_counties or filter_offices:
        filtered = [c for c in all_candidates if is_target_candidate(c, filter_counties, filter_offices, target_counties)]
        print(f"After filtering: {len(filtered)} candidates (from {len(all_candidates)})")
        all_candidates = filtered

    # Deduplicate by (name, office)
    seen = set()
    unique = []
    for c in all_candidates:
        key = (c["name"].upper(), c["office"].upper())
        if key not in seen:
            seen.add(key)
            unique.append(c)
    all_candidates = unique
    print(f"After dedup: {len(all_candidates)} unique candidates")

    # Save
    save_candidates_csv(all_candidates, output_path)
    print(f"\nDone! Run find_candidate_emails.py next to look up emails.")


if __name__ == "__main__":
    main()
