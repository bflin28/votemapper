#!/usr/bin/env python3
"""
VoteRef.com scraper using Playwright in headed mode.

Usage:
    pip install playwright playwright-stealth
    playwright install chromium
    python scripts/scrape_voteref.py --state TX --county Armstrong

The browser opens headed so you can:
  1. Solve any Cloudflare CAPTCHA
  2. Navigate to the right page if auto-navigation fails
  3. Press Enter in the terminal when the voter table is visible

The script then scrapes all pages of voter data and saves to CSV.
"""

import argparse
import asyncio
import csv
import json
import os
import re
import sys
import time
from datetime import datetime
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
except ImportError:
    print("Install playwright: pip install playwright && playwright install chromium")
    sys.exit(1)

try:
    from playwright.async_api import async_playwright, TimeoutError as PWTimeoutAsync
except ImportError:
    PWTimeoutAsync = None

try:
    from playwright_stealth import stealth_sync
    HAS_STEALTH = True
except ImportError:
    HAS_STEALTH = False
    print("Note: install playwright-stealth for better Cloudflare bypass: pip install playwright-stealth")

try:
    from playwright_stealth import stealth_async
    HAS_STEALTH_ASYNC = True
except ImportError:
    HAS_STEALTH_ASYNC = False


def dismiss_popups(page):
    """Try to dismiss any 'I Agree' / terms-of-service popups."""
    labels = ["I Agree", "Accept", "I Accept", "Agree & Continue", "Continue", "OK", "I understand", "Close"]
    time.sleep(1)  # brief wait for popup to render
    for label in labels:
        for tag in ["button", "a"]:
            try:
                el = page.query_selector(f"{tag}:has-text('{label}')")
                if el and el.is_visible():
                    el.click()
                    print(f"  Dismissed popup: clicked '{label}'")
                    time.sleep(0.5)
                    return
            except Exception:
                continue


def parse_address(full_address):
    """Split '804 Hoffer St, Claude TX 79019' into (street, city, state, zip)."""
    m = re.match(r'^(.+?),\s*(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$', full_address.strip())
    if m:
        return m.group(1), m.group(2), m.group(3), m.group(4)
    return full_address.strip(), "", "", ""


def geocode_voters(rows, headers):
    """Geocode voter addresses via the Census Batch Geocoder.

    Args:
        rows: List of row data lists (last element is detail URL)
        headers: Column headers from the table

    Returns:
        dict mapping row index -> (lat, lng)
    """
    BATCH_URL = "https://geocoding.geo.census.gov/geocoder/geographies/addressbatch"
    SINGLE_URL = "https://geocoding.geo.census.gov/geocoder/geographies/address"
    BATCH_SIZE = 1000

    # Find the address column — try "Registered Address", "Detail Address", or fallback to column 1
    addr_col = None
    for i, h in enumerate(headers):
        if "address" in h.lower():
            addr_col = i
            break
    if addr_col is None:
        addr_col = 1  # Default: second column is usually address

    # Build list of (index, street, city, state, zip) for geocoding
    addresses = []
    for idx, row in enumerate(rows):
        row_data = row[:-1]  # exclude detail URL
        if addr_col < len(row_data):
            raw_addr = row_data[addr_col]
        else:
            continue
        street, city, state, zip_code = parse_address(raw_addr)
        if street:
            addresses.append((idx, street, city, state, zip_code))

    if not addresses:
        print("No addresses found to geocode.")
        return {}

    print(f"\nGeocoding {len(addresses)} addresses via Census Batch Geocoder...")
    results = {}

    # Process in batches
    for batch_start in range(0, len(addresses), BATCH_SIZE):
        batch = addresses[batch_start:batch_start + BATCH_SIZE]
        batch_num = batch_start // BATCH_SIZE + 1
        total_batches = (len(addresses) + BATCH_SIZE - 1) // BATCH_SIZE
        if total_batches > 1:
            print(f"  Batch {batch_num}/{total_batches} ({len(batch)} addresses)...")

        # Build CSV content for the batch
        csv_lines = []
        for idx, street, city, state, zip_code in batch:
            csv_lines.append(f"{idx},{street},{city},{state},{zip_code}")
        csv_content = "\n".join(csv_lines)

        # Build multipart form data manually (no external deps)
        boundary = "----CensusBatchBoundary"
        body = ""
        body += f"--{boundary}\r\n"
        body += 'Content-Disposition: form-data; name="addressFile"; filename="addresses.csv"\r\n'
        body += "Content-Type: text/csv\r\n\r\n"
        body += csv_content + "\r\n"
        body += f"--{boundary}\r\n"
        body += 'Content-Disposition: form-data; name="benchmark"\r\n\r\n'
        body += "Public_AR_Current\r\n"
        body += f"--{boundary}\r\n"
        body += 'Content-Disposition: form-data; name="vintage"\r\n\r\n'
        body += "Current_Current\r\n"
        body += f"--{boundary}--\r\n"

        try:
            req = Request(BATCH_URL, data=body.encode("utf-8"), method="POST")
            req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
            with urlopen(req, timeout=120) as resp:
                response_text = resp.read().decode("utf-8")

            # Parse response — same format as TypeScript geocoder
            for line in response_text.strip().split("\n"):
                if not line.strip():
                    continue
                parts = line.split('","')
                parts = [p.strip().strip('"') for p in parts]
                row_id = parts[0] if parts else ""
                match_status = parts[2] if len(parts) > 2 else ""
                coords = parts[5] if len(parts) > 5 else ""

                if match_status == "Match" and coords:
                    coord_parts = coords.split(",")
                    if len(coord_parts) == 2:
                        try:
                            lng, lat = float(coord_parts[0]), float(coord_parts[1])
                            results[int(row_id)] = (lat, lng)
                        except (ValueError, IndexError):
                            pass
        except Exception as e:
            print(f"  WARNING: Batch geocoding failed: {e}")

    matched = len(results)
    unmatched_count = len(addresses) - matched
    print(f"  Batch geocoded: {matched}/{len(addresses)} matched ({100*matched//len(addresses) if addresses else 0}%)")

    # Retry unmatched individually via single-address endpoint
    if unmatched_count > 0:
        print(f"  Retrying {unmatched_count} unmatched individually...")
        retry_count = 0
        for idx, street, city, state, zip_code in addresses:
            if idx in results:
                continue
            params = urlencode({
                "street": street,
                "city": city,
                "state": state,
                "zip": zip_code,
                "benchmark": "Public_AR_Current",
                "vintage": "Current_Current",
                "format": "json",
            })
            try:
                req = Request(f"{SINGLE_URL}?{params}")
                with urlopen(req, timeout=30) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                matches = data.get("result", {}).get("addressMatches", [])
                if matches:
                    lng = matches[0]["coordinates"]["x"]
                    lat = matches[0]["coordinates"]["y"]
                    results[idx] = (lat, lng)
                    retry_count += 1
            except Exception:
                pass
            time.sleep(0.2)  # 200ms delay between retries

        print(f"  Retried: {retry_count} additional matches")

    total_matched = len(results)
    print(f"  Total: {total_matched}/{len(addresses)} addresses geocoded ({100*total_matched//len(addresses) if addresses else 0}%)")
    return results


def wait_for_cloudflare(page, timeout=60):
    """Wait for Cloudflare challenge to clear."""
    start = time.time()
    while time.time() - start < timeout:
        title = page.title().lower()
        # Cloudflare challenge pages have distinctive titles
        if "just a moment" in title or "attention required" in title:
            print("  Waiting for Cloudflare challenge to clear...")
            time.sleep(2)
            continue
        # Check if page has real content
        body_text = page.text_content("body") or ""
        if len(body_text) > 200:
            return True
        time.sleep(1)
    return False


def try_navigate_to_voters(page, state, county, precinct=None):
    """Attempt to navigate to the voter list. Returns True if a table is found."""
    base = "https://voteref.com"

    # Try common URL patterns
    urls_to_try = [
        f"{base}/voters?state={state}&search=&counties={county}",
    ]

    if precinct:
        urls_to_try.insert(0, f"{base}/voters?state={state}&search=&counties={county}&precinctCodes={precinct}")

    for url in urls_to_try:
        print(f"  Trying: {url}")
        try:
            page.goto(url, timeout=30000)
            wait_for_cloudflare(page)
            dismiss_popups(page)
            # Look for a data table
            table = page.query_selector("table")
            if table:
                print(f"  Found table at {url}")
                return True
        except Exception as e:
            print(f"  Failed: {e}")
            continue

    return False


def scrape_table(page):
    """Scrape all rows from the current table, including headers and detail URLs.

    Returns (headers, rows) where each row has an extra last element containing
    the voter detail URL (or empty string if no link found).
    """
    # Try to find the VoteRef voter table specifically, then fall back to any table
    table = page.query_selector("table#voter-search-table") or page.query_selector("table")
    if not table:
        return [], []

    # Get headers — VoteRef's header cells use <td> with embedded icons/buttons,
    # so text_content() returns garbled text. Use known clean headers when possible.
    headers = []
    table_id = table.get_attribute("id") or ""
    if table_id == "voter-search-table":
        headers = ["Name", "Registered Address", "DoB/Age", "Vote History", "Party Affiliation"]
    else:
        header_cells = table.query_selector_all("thead th, thead td, tr:first-child th, tr:first-child td")
        if header_cells:
            headers = [cell.text_content().strip() for cell in header_cells]

    # Get data rows — use "tbody tr" only (NOT "tbody tr, tr") because VoteRef's
    # <thead> uses <td> instead of <th>, which would be included as a fake data row
    rows = []
    body_rows = table.query_selector_all("tbody tr")
    for row in body_rows:
        cells = row.query_selector_all("td")
        if not cells:
            continue
        row_data = [cell.text_content().strip() for cell in cells]
        if any(row_data):  # skip empty rows
            # Extract detail URL from the first cell's <a> tag
            detail_url = ""
            link = cells[0].query_selector("a[href*='VoterDetails']")
            if link:
                href = link.get_attribute("href") or ""
                if href:
                    # Make absolute if relative
                    if href.startswith("/"):
                        detail_url = f"https://voteref.com{href}"
                    else:
                        detail_url = href
            row_data.append(detail_url)
            rows.append(row_data)

    return headers, rows


def extract_person_id(detail_url):
    """Extract personId from a VoterDetails URL."""
    if not detail_url:
        return ""
    parsed = urlparse(detail_url)
    params = parse_qs(parsed.query)
    ids = params.get("personId", [])
    return ids[0] if ids else ""


def scrape_voter_detail(page, detail_url):
    """Scrape a voter's detail page for vote history and registration info.

    Returns a dict:
        {
            "history": [[election, recorded_vote, method, state, election_date], ...],
            "info": {"Registration Status": "...", "Registration Date": "...", ...},
            "last_voted": "MM/DD/YYYY" or ""
        }
    """
    result = {"history": [], "info": {}, "last_voted": ""}

    page.goto(detail_url, timeout=15000)
    page.wait_for_load_state("networkidle")
    dismiss_popups(page)

    # Wait for vote history table rows (not just the empty DataTable shell)
    try:
        page.wait_for_selector("#voter-history-table tbody tr", timeout=5000)
    except PWTimeout:
        # No vote history rows — try to still grab info
        pass

    # Extract voter info from li elements with .details-subtitle spans
    info_items = page.query_selector_all("li:has(.details-subtitle)")
    for item in info_items:
        label_el = item.query_selector(".details-subtitle")
        if not label_el:
            continue
        key = label_el.text_content().strip()
        # Value is full text minus the "edit" icon text and the label
        full_text = item.text_content().strip()
        val = full_text
        if val.startswith("edit"):
            val = val[4:]
        val = val.replace(key, "", 1).strip()
        if key:
            result["info"][key] = val

    # Extract vote history table
    history_table = page.query_selector("table#voter-history-table")
    if history_table:
        hist_rows = history_table.query_selector_all("tbody tr")
        for row in hist_rows:
            cells = row.query_selector_all("td")
            if not cells:
                continue
            cell_data = [c.text_content().strip() for c in cells]
            if any(cell_data):
                result["history"].append(cell_data)

        # Determine last voted date (most recent election date)
        dates = []
        for h in result["history"]:
            # Election date is typically the last column
            date_str = h[-1] if h else ""
            try:
                dt = datetime.strptime(date_str, "%m/%d/%Y")
                dates.append(dt)
            except (ValueError, IndexError):
                # Try other columns in case layout differs
                for cell in reversed(h):
                    try:
                        dt = datetime.strptime(cell, "%m/%d/%Y")
                        dates.append(dt)
                        break
                    except ValueError:
                        continue

        if dates:
            result["last_voted"] = max(dates).strftime("%m/%d/%Y")

    return result


async def async_dismiss_popups(page):
    """Async version: try to dismiss any popups without the 1s sleep."""
    labels = ["I Agree", "Accept", "I Accept", "Agree & Continue", "Continue", "OK", "I understand", "Close"]
    for label in labels:
        for tag in ["button", "a"]:
            try:
                el = await page.query_selector(f"{tag}:has-text('{label}')")
                if el and await el.is_visible():
                    await el.click()
                    await asyncio.sleep(0.3)
                    return
            except Exception:
                continue


async def async_scrape_voter_detail(page, detail_url, dismiss_popup=False):
    """Async mirror of scrape_voter_detail. Same logic with await on Playwright calls.

    Args:
        page: Async Playwright page object
        detail_url: URL of the voter detail page
        dismiss_popup: If True, check for popups (only needed on first request per worker)

    Returns:
        Same dict as scrape_voter_detail: {history, info, last_voted}
    """
    result = {"history": [], "info": {}, "last_voted": ""}

    await page.goto(detail_url, timeout=15000)
    await page.wait_for_load_state("networkidle")

    if dismiss_popup:
        await async_dismiss_popups(page)

    # Wait for vote history table rows
    try:
        await page.wait_for_selector("#voter-history-table tbody tr", timeout=5000)
    except Exception:
        pass

    # Extract voter info from li elements with .details-subtitle spans
    info_items = await page.query_selector_all("li:has(.details-subtitle)")
    for item in info_items:
        label_el = await item.query_selector(".details-subtitle")
        if not label_el:
            continue
        key = (await label_el.text_content()).strip()
        full_text = (await item.text_content()).strip()
        val = full_text
        if val.startswith("edit"):
            val = val[4:]
        val = val.replace(key, "", 1).strip()
        if key:
            result["info"][key] = val

    # Extract vote history table
    history_table = await page.query_selector("table#voter-history-table")
    if history_table:
        hist_rows = await history_table.query_selector_all("tbody tr")
        for row in hist_rows:
            cells = await row.query_selector_all("td")
            if not cells:
                continue
            cell_data = []
            for c in cells:
                cell_data.append((await c.text_content()).strip())
            if any(cell_data):
                result["history"].append(cell_data)

        # Determine last voted date
        dates = []
        for h in result["history"]:
            date_str = h[-1] if h else ""
            try:
                dt = datetime.strptime(date_str, "%m/%d/%Y")
                dates.append(dt)
            except (ValueError, IndexError):
                for cell in reversed(h):
                    try:
                        dt = datetime.strptime(cell, "%m/%d/%Y")
                        dates.append(dt)
                        break
                    except ValueError:
                        continue

        if dates:
            result["last_voted"] = max(dates).strftime("%m/%d/%Y")

    return result


async def async_scrape_voter_details(storage_state, voters_to_scrape, concurrency):
    """Concurrent detail scraper using async Playwright.

    Launches a new async browser, restores session via storage_state,
    creates N pages, and scrapes detail pages concurrently.

    Args:
        storage_state: Dict from context.storage_state() (cookies + localStorage)
        voters_to_scrape: List of (name, person_id, detail_url) tuples
        concurrency: Number of concurrent worker pages

    Returns:
        dict mapping personId -> scrape_voter_detail() result
    """
    histories = {}
    failed = 0
    total = len(voters_to_scrape)
    # Shared mutable index — safe because asyncio is single-threaded
    progress = {"next": 0, "done": 0, "errors": 0}
    # Track recent results for adaptive delay
    recent_results = []  # list of booleans (True=success, False=error)
    base_delay = 1.0

    async def worker(worker_id, page):
        nonlocal failed
        is_first = True
        while True:
            idx = progress["next"]
            if idx >= total:
                break
            progress["next"] = idx + 1

            name, person_id, url = voters_to_scrape[idx]
            try:
                detail = await async_scrape_voter_detail(page, url, dismiss_popup=is_first)
                is_first = False
                histories[person_id] = detail
                hist_count = len(detail["history"])
                last = detail["last_voted"] or "N/A"
                progress["done"] += 1
                recent_results.append(True)
                print(f"  [{worker_id}] {progress['done']}/{total}: {name} -> {hist_count} elections, last voted: {last}")
            except Exception as e:
                progress["done"] += 1
                progress["errors"] += 1
                failed += 1
                recent_results.append(False)
                print(f"  [{worker_id}] {progress['done']}/{total}: {name} -> FAILED: {e}")

            # Adaptive delay: check error rate in last 20 results
            window = recent_results[-20:]
            if len(window) >= 5:
                error_rate = sum(1 for r in window if not r) / len(window)
                if error_rate > 0.2:
                    delay = base_delay * 3  # back off
                    print(f"  [{worker_id}] High error rate ({error_rate:.0%}), backing off to {delay:.1f}s delay")
                else:
                    delay = base_delay
            else:
                delay = base_delay
            await asyncio.sleep(delay)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            storage_state=storage_state,
        )

        # Create N pages
        pages = []
        for i in range(concurrency):
            pg = await context.new_page()
            if HAS_STEALTH_ASYNC:
                await stealth_async(pg)
            pages.append(pg)

        print(f"\nLaunched {concurrency} concurrent workers for {total} voters...")

        # Run workers concurrently
        tasks = [worker(i + 1, pages[i]) for i in range(concurrency)]
        await asyncio.gather(*tasks)

        # Cleanup
        for pg in pages:
            await pg.close()
        await browser.close()

    print(f"\nConcurrent detail scraping complete: {len(histories)} succeeded, {failed} failed")
    return histories


def set_page_size(page, size=50):
    """Set the page size dropdown to show more rows per page."""
    try:
        select = page.query_selector("select#list_display")
        if select:
            select.select_option(str(size))
            page.wait_for_timeout(2000)
            print(f"  Set page size to {size}")
            return True
    except Exception:
        pass
    return False


def find_next_button(page):
    """Find the next page button if pagination has more pages.

    VoteRef uses a#next-page which gets a 'disabled' CSS class on the last page.
    Since <a> tags always pass is_enabled(), we must check the class directly.
    """
    try:
        btn = page.query_selector("a#next-page")
        if btn and btn.is_visible():
            classes = btn.get_attribute("class") or ""
            if "disabled" not in classes:
                return btn
    except Exception:
        pass
    return None


def scrape_all_pages(page, max_pages=100):
    """Scrape the current table and all subsequent pages."""
    all_rows = []
    headers = []
    seen_first_rows = set()

    # Increase page size to reduce number of pagination clicks
    set_page_size(page, 50)

    for page_num in range(1, max_pages + 1):
        print(f"  Scraping page {page_num}...")
        time.sleep(1)  # polite delay

        h, rows = scrape_table(page)
        if h and not headers:
            headers = h

        if not rows:
            print(f"  No rows found on page {page_num}, stopping.")
            break

        # Detect duplicate page (pagination looped)
        first_row_key = "|".join(rows[0]) if rows else ""
        if first_row_key in seen_first_rows:
            print(f"  Duplicate page detected, stopping.")
            break
        seen_first_rows.add(first_row_key)

        all_rows.extend(rows)
        print(f"  Got {len(rows)} rows (total: {len(all_rows)})")

        # Try to go to next page
        next_btn = find_next_button(page)
        if not next_btn:
            print(f"  No more pages, done.")
            break

        # Remember first row to detect when page actually changes
        old_first_row = first_row_key
        try:
            next_btn.click()
            # Wait for table data to actually change (up to 5s)
            for _ in range(10):
                page.wait_for_timeout(500)
                _, new_rows = scrape_table(page)
                if new_rows:
                    new_first = "|".join(new_rows[0])
                    if new_first != old_first_row:
                        break
            else:
                print(f"  Table didn't change after clicking next, stopping.")
                break
        except Exception as e:
            print(f"  Error clicking next: {e}")
            page.wait_for_timeout(2000)

    return headers, all_rows


def scrape_voter_details(page, rows, voter_list_url):
    """Scrape detail pages for ALL voters that have a detail URL.

    Args:
        page: Playwright page object
        rows: List of row data lists (last element is detail URL)
        voter_list_url: The original voter list URL to navigate back to after

    Returns:
        dict mapping personId -> scrape_voter_detail() result
    """
    voters_to_scrape = []
    for row in rows:
        detail_url = row[-1] if row else ""
        if not detail_url:
            continue
        name = row[0] if row else "Unknown"
        person_id = extract_person_id(detail_url)
        voters_to_scrape.append((name, person_id, detail_url))

    if not voters_to_scrape:
        print("\nNo voters with detail URLs to fetch.")
        return {}

    print(f"\nFetching details for {len(voters_to_scrape)} voters...")
    histories = {}
    failed = 0

    for i, (name, person_id, url) in enumerate(voters_to_scrape, 1):
        print(f"  Fetching details {i}/{len(voters_to_scrape)}: {name}...")
        try:
            detail = scrape_voter_detail(page, url)
            histories[person_id] = detail
            hist_count = len(detail["history"])
            reg_status = detail.get("info", {}).get("Registration Status", "N/A")
            last = detail["last_voted"] or "N/A"
            print(f"    -> {hist_count} elections, last voted: {last}, status: {reg_status}")
        except Exception as e:
            print(f"    WARNING: Failed to scrape {name}: {e}")
            failed += 1
            continue
        time.sleep(1)  # polite delay between requests

    print(f"\nVoter detail scraping complete: {len(histories)} succeeded, {failed} failed")

    # Navigate back to voter list so the browser doesn't stay on a detail page
    try:
        page.goto(voter_list_url, timeout=15000)
    except Exception:
        pass

    return histories


def save_csv(headers, rows, histories, output_path, geocode_results=None):
    """Save main voter list CSV with Last Voted, Registration Status, and geocode columns.

    Args:
        headers: Original table headers
        rows: List of row data lists (last element is detail URL, excluded from output)
        histories: dict mapping personId -> vote history data
        output_path: Path to write CSV
        geocode_results: dict mapping row index -> (lat, lng), or None
    """
    if geocode_results is None:
        geocode_results = {}
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    # Build enriched headers (add Last Voted, Registration Status, Detail Address, and geocode)
    extra_cols = ["Last Voted", "Registration Status", "Detail Address", "Latitude", "Longitude"]
    out_headers = list(headers) + extra_cols if headers else []

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if out_headers:
            writer.writerow(out_headers)
        for idx, row in enumerate(rows):
            # Separate detail URL from row data
            detail_url = row[-1] if row else ""
            row_data = row[:-1]  # exclude URL

            person_id = extract_person_id(detail_url)
            detail = histories.get(person_id, {})
            last_voted = detail.get("last_voted", "")
            reg_status = detail.get("info", {}).get("Registration Status", "")
            # Address from detail page (may have more detail than list table)
            detail_addr = detail.get("info", {}).get("Registration Address", "")
            if not detail_addr:
                detail_addr = detail.get("info", {}).get("Address", "")

            lat, lng = geocode_results.get(idx, ("", ""))
            writer.writerow(row_data + [last_voted, reg_status, detail_addr, lat, lng])

    print(f"\nSaved {len(rows)} rows to {output_path}")


def save_history_csv(rows, histories, output_path):
    """Save full vote history detail to a separate CSV.

    Columns: Name, PersonId, Election, Recorded Vote, Method, State, Election Date
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    hist_headers = ["Name", "PersonId", "Election", "Recorded Vote", "Method", "State", "Election Date"]

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(hist_headers)

        for row in rows:
            detail_url = row[-1] if row else ""
            person_id = extract_person_id(detail_url)
            if not person_id or person_id not in histories:
                continue

            name = row[0] if row else "Unknown"
            detail = histories[person_id]

            for hist_row in detail.get("history", []):
                # Pad to 5 columns if needed
                padded = hist_row + [""] * (5 - len(hist_row))
                writer.writerow([name, person_id] + padded[:5])

    total_records = sum(len(h.get("history", [])) for h in histories.values())
    print(f"Saved {total_records} vote history records to {output_path}")


def save_full_json(headers, rows, histories, output_path, geocode_results=None):
    """Save complete data as JSON for programmatic analysis."""
    if geocode_results is None:
        geocode_results = {}
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    voters = []
    for idx, row in enumerate(rows):
        detail_url = row[-1] if row else ""
        row_data = row[:-1]
        person_id = extract_person_id(detail_url)

        # Build voter object with named fields from headers
        voter = {}
        for i, val in enumerate(row_data):
            key = headers[i] if i < len(headers) else f"col_{i}"
            voter[key] = val

        voter["person_id"] = person_id
        voter["detail_url"] = detail_url

        # Add geocode coordinates
        lat, lng = geocode_results.get(idx, (None, None))
        voter["latitude"] = lat
        voter["longitude"] = lng

        # Add vote history detail if available
        detail = histories.get(person_id, {})
        voter["last_voted"] = detail.get("last_voted", "")
        voter["registration_info"] = detail.get("info", {})
        voter["vote_history"] = []
        for hist_row in detail.get("history", []):
            padded = hist_row + [""] * (5 - len(hist_row))
            voter["vote_history"].append({
                "election": padded[0],
                "recorded_vote": padded[1],
                "method": padded[2],
                "state": padded[3],
                "election_date": padded[4],
            })

        voters.append(voter)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(voters, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(voters)} voter records (full JSON) to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Scrape VoteRef.com voter data")
    parser.add_argument("--state", default="TX", help="State abbreviation (default: TX)")
    parser.add_argument("--county", default="Armstrong", help="County name (default: Armstrong)")
    parser.add_argument("--precinct", default=None, help="Precinct number (optional)")
    parser.add_argument("--output", default=None, help="Output base path (without extension)")
    parser.add_argument("--manual", action="store_true",
                        help="Skip auto-navigation, just open voteref.com and wait for you")
    parser.add_argument("--no-details", action="store_true",
                        help="Skip vote history detail scraping (faster, list only)")
    parser.add_argument("--no-geocode", action="store_true",
                        help="Skip geocoding (default: geocode after scraping)")
    parser.add_argument("--concurrency", type=int, default=1,
                        help="Number of concurrent detail scrapers (default: 1 sequential, increase at risk of rate limiting)")
    args = parser.parse_args()

    # Build output base path (without extension)
    if not args.output:
        output_base = f"data/voteref-{args.state.lower()}-{args.county.lower()}"
        if args.precinct:
            output_base += f"-{args.precinct}"
    else:
        # Strip extension if user provided one
        output_base = args.output.rsplit(".", 1)[0] if "." in args.output else args.output

    csv_path = f"{output_base}.csv"
    history_csv_path = f"{output_base}-history.csv"
    json_path = f"{output_base}-full.json"

    concurrency = max(1, args.concurrency)

    print(f"VoteRef Scraper")
    print(f"  State: {args.state}")
    print(f"  County: {args.county}")
    if args.precinct:
        print(f"  Precinct: {args.precinct}")
    print(f"  Output: {csv_path}")
    if not args.no_details:
        print(f"  History: {history_csv_path}")
        print(f"  Full JSON: {json_path}")
        print(f"  Concurrency: {concurrency}")
    print()

    # Phase 1: Sync browser handles list scraping (pagination, Cloudflare, manual interaction)
    storage_state = None
    voters_to_scrape = []
    headers = []
    rows = []
    histories = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
            ],
        )
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        )
        page = context.new_page()

        if HAS_STEALTH:
            stealth_sync(page)

        # Navigate
        if args.manual:
            print("Opening voteref.com — navigate to the voter table yourself.")
            page.goto("https://voteref.com", timeout=60000)
            dismiss_popups(page)
        else:
            print("Attempting auto-navigation...")
            page.goto("https://voteref.com", timeout=60000)
            print("Waiting for Cloudflare...")
            cf_ok = wait_for_cloudflare(page)
            if not cf_ok:
                print("Cloudflare didn't clear automatically.")
                print("Please solve the CAPTCHA in the browser, then press Enter here.")
                input("Press Enter when ready...")
                wait_for_cloudflare(page, timeout=30)
            dismiss_popups(page)

            found = try_navigate_to_voters(page, args.state, args.county, args.precinct)
            if not found:
                print("\nCouldn't auto-navigate to the voter table.")
                print("Please navigate manually in the browser to the page with voter data.")

        dismiss_popups(page)
        print("\n" + "=" * 60)
        print("When the voter data TABLE is visible in the browser,")
        print("press Enter here to start scraping.")
        print("=" * 60)
        input("\nPress Enter to scrape...")

        # Verify table exists
        table = page.query_selector("table")
        if not table:
            print("No table found on the current page.")
            print("Waiting 5 seconds for it to load...")
            page.wait_for_timeout(5000)
            table = page.query_selector("table")

        if not table:
            print("Still no table found. Dumping page text for debugging:")
            print(page.text_content("body")[:1000])
            browser.close()
            sys.exit(1)

        # Remember the current voter list URL for navigating back after detail scraping
        voter_list_url = page.url

        # Scrape voter list
        print("\nScraping voter data...")
        headers, rows = scrape_all_pages(page)

        if not rows:
            print("\nNo data was scraped. The table may have a different structure.")
            print("Try using --manual mode and navigating to the exact page.")
            browser.close()
            sys.exit(1)

        print(f"\n{'=' * 60}")
        print(f"Scraped {len(rows)} voters from list pages.")

        # Scrape vote history details (unless --no-details)
        if not args.no_details:
            if concurrency > 1:
                # Concurrent path: extract session, close sync browser, run async scraper
                print(f"\nExtracting session for concurrent scraping...")
                storage_state = context.storage_state()

                # Build voters_to_scrape list before closing browser
                voters_to_scrape = []
                for row in rows:
                    detail_url = row[-1] if row else ""
                    if not detail_url:
                        continue
                    name = row[0] if row else "Unknown"
                    person_id = extract_person_id(detail_url)
                    voters_to_scrape.append((name, person_id, detail_url))

                print("Closing sync browser (freeing resources for async workers)...")
                browser.close()
            else:
                # Sequential path: use existing sync browser
                histories = scrape_voter_details(page, rows, voter_list_url)
                print("\nClosing browser...")
                browser.close()
        else:
            print("\nClosing browser...")
            browser.close()

    # Phase 2: Concurrent detail scraping (runs after sync browser is closed)
    if not args.no_details and concurrency > 1 and storage_state:
        if not voters_to_scrape:
            print("\nNo voters with detail URLs to fetch.")
        else:
            print(f"\nStarting concurrent detail scraping with {concurrency} workers...")
            histories = asyncio.run(
                async_scrape_voter_details(storage_state, voters_to_scrape, concurrency)
            )

    # Geocode addresses (runs outside Playwright — uses urllib only)
    geocode_results = {}
    if not args.no_geocode:
        geocode_results = geocode_voters(rows, headers)

    # Save all output files
    print(f"\n{'=' * 60}")
    print("Saving output files...")
    save_csv(headers, rows, histories, csv_path, geocode_results)

    if histories:
        save_history_csv(rows, histories, history_csv_path)
        save_full_json(headers, rows, histories, json_path, geocode_results)

    print(f"\nDone! {len(rows)} voter records processed.")
    if histories:
        total_hist = sum(len(h.get("history", [])) for h in histories.values())
        print(f"  {len(histories)} voters with detailed vote history ({total_hist} election records)")
    if geocode_results:
        print(f"  {len(geocode_results)}/{len(rows)} addresses geocoded")
    print(f"You can now import {csv_path} into VoteMapper.")


if __name__ == "__main__":
    main()
