#!/usr/bin/env python3
"""
Find candidate emails from public sources and store in a local SQLite database.

Searches:
  1. TX SoS campaign finance filings (treasurer email)
  2. Google search for candidate campaign pages

Usage:
    # Import candidates from CSV into local DB
    python scripts/find_candidate_emails.py import data/tx-candidates-2026.csv

    # Search for emails for candidates in DB
    python scripts/find_candidate_emails.py search

    # Do both
    python scripts/find_candidate_emails.py import data/tx-candidates-2026.csv --then-search

    # List all candidates
    python scripts/find_candidate_emails.py list

Database: data/candidates.db (SQLite, auto-created)
"""

import argparse
import csv
import json
import os
import re
import sqlite3
import sys
import time
from urllib.parse import quote_plus, urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "candidates.db")

# Email regex for extraction from web pages
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")

# Common campaign-irrelevant email domains to skip
SKIP_DOMAINS = {
    "example.com", "sampleemail.com", "email.com",
    "facebook.com", "twitter.com", "instagram.com",
    "google.com", "youtube.com", "linkedin.com",
    "noreply.com", "no-reply.com",
}


def get_db():
    """Open (and initialize) the local SQLite database."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            office TEXT NOT NULL,
            party TEXT,
            county TEXT,
            state TEXT DEFAULT 'TX',
            election_date TEXT,
            election_type TEXT,
            source_url TEXT,
            email TEXT,
            notes TEXT,
            outreach_status TEXT DEFAULT 'new',
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(name, office, election_date)
        )
    """)
    conn.commit()
    return conn


def import_candidates_from_csv(csv_path, conn):
    """Import candidates from a CSV into the local candidates table."""
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Importing {len(rows)} candidates from {csv_path}...")

    imported = 0
    skipped = 0

    for row in rows:
        name = row.get("name", "").strip()
        office = row.get("office", "").strip()

        if not name or not office:
            skipped += 1
            continue

        try:
            conn.execute("""
                INSERT INTO candidates (name, office, party, county, state, election_date, election_type, source_url, outreach_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')
                ON CONFLICT(name, office, election_date) DO UPDATE SET
                    party = excluded.party,
                    county = excluded.county,
                    source_url = excluded.source_url
            """, (
                name,
                office,
                row.get("party", "").strip() or None,
                row.get("county", "").strip() or None,
                row.get("state", "TX").strip(),
                row.get("election_date", "").strip() or None,
                row.get("election_type", "").strip() or None,
                row.get("source_url", "").strip() or None,
            ))
            imported += 1
        except Exception as e:
            print(f"  Error inserting {name}: {e}")
            skipped += 1

    conn.commit()
    print(f"Imported: {imported}, Skipped: {skipped}")
    return imported


def fetch_url(url, timeout=10):
    """Fetch a URL and return text content."""
    try:
        req = Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        })
        with urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="ignore")
    except (URLError, HTTPError, Exception) as e:
        return ""


def extract_emails_from_text(text):
    """Extract valid email addresses from text, filtering noise."""
    raw = EMAIL_RE.findall(text)
    valid = []
    for email in raw:
        email = email.lower().strip()
        domain = email.split("@")[-1]
        if domain in SKIP_DOMAINS:
            continue
        if domain.endswith(".gov"):
            valid.append(email)
            continue
        if any(skip in email for skip in ["webmaster", "admin@", "info@", "support@", "noreply"]):
            continue
        valid.append(email)
    return list(set(valid))


def search_tx_campaign_finance(name, county=None):
    """Search TX Ethics Commission campaign finance filings for candidate email.

    Returns: list of (email, confidence) tuples
    """
    results = []
    search_url = f"https://www.ethics.state.tx.us/search/cf/CFS-SearchResults.php?name={quote_plus(name)}"
    text = fetch_url(search_url)
    if text:
        emails = extract_emails_from_text(text)
        for email in emails:
            results.append((email, "verified"))
    return results


def search_google(name, county=None, state="TX"):
    """Search Google Custom Search API for candidate campaign email.

    Requires GOOGLE_API_KEY and GOOGLE_CX env vars.
    Returns: list of (email, confidence) tuples
    """
    results = []

    api_key = os.environ.get("GOOGLE_API_KEY")
    cx = os.environ.get("GOOGLE_CX")

    query = f'"{name}" {county or ""} {state} email campaign'

    if api_key and cx:
        params = urlencode({"key": api_key, "cx": cx, "q": query, "num": 5})
        url = f"https://www.googleapis.com/customsearch/v1?{params}"
        text = fetch_url(url, timeout=15)
        if text:
            try:
                data = json.loads(text)
                for item in data.get("items", []):
                    snippet = item.get("snippet", "")
                    link = item.get("link", "")
                    emails = extract_emails_from_text(snippet)
                    for email in emails:
                        results.append((email, "guessed"))
                    if link and not any(d in link for d in ["facebook.com", "twitter.com", "youtube.com"]):
                        page_text = fetch_url(link)
                        emails = extract_emails_from_text(page_text)
                        for email in emails:
                            results.append((email, "guessed"))
            except json.JSONDecodeError:
                pass

    return results


def find_email_for_candidate(candidate):
    """Search all sources for a candidate's email.

    Returns: (best_email, confidence) or (None, None)
    """
    name = candidate["name"]
    county = candidate["county"]
    state = candidate["state"] or "TX"

    all_results = []

    # 1. TX campaign finance filings
    cf_results = search_tx_campaign_finance(name, county)
    all_results.extend(cf_results)

    # 2. Google search
    time.sleep(0.5)
    google_results = search_google(name, county, state)
    all_results.extend(google_results)

    if not all_results:
        return None, None

    # Prefer "verified" over "guessed"
    verified = [(e, c) for e, c in all_results if c == "verified"]
    if verified:
        return verified[0]

    return all_results[0]


def search_all_candidates(conn, limit=None):
    """Search for emails for all candidates without emails."""
    query = "SELECT * FROM candidates WHERE email IS NULL ORDER BY created_at"
    if limit:
        query += f" LIMIT {int(limit)}"

    candidates = conn.execute(query).fetchall()

    print(f"\nSearching emails for {len(candidates)} candidates without emails...")
    found = 0

    for i, row in enumerate(candidates, 1):
        candidate = dict(row)
        name = candidate["name"]
        county = candidate.get("county", "")
        print(f"  [{i}/{len(candidates)}] {name} ({county})...", end=" ", flush=True)

        email, confidence = find_email_for_candidate(candidate)

        if email:
            notes = f"Email confidence: {confidence}"
            conn.execute(
                "UPDATE candidates SET email = ?, notes = ? WHERE id = ?",
                (email, notes, candidate["id"]),
            )
            conn.commit()
            print(f"FOUND: {email} ({confidence})")
            found += 1
        else:
            print("no email found")

        time.sleep(1)

    print(f"\nDone! Found emails for {found}/{len(candidates)} candidates.")
    return found


def list_candidates(conn, county=None):
    """Print all candidates in the DB."""
    query = "SELECT * FROM candidates"
    params = ()
    if county:
        query += " WHERE LOWER(county) = LOWER(?)"
        params = (county,)
    query += " ORDER BY county, office, name"

    rows = conn.execute(query, params).fetchall()
    if not rows:
        print("No candidates found.")
        return

    print(f"\n{'Name':<30} {'Office':<35} {'Party':<12} {'County':<15} {'Email':<30} {'Status'}")
    print("-" * 155)
    for row in rows:
        r = dict(row)
        print(f"{r['name']:<30} {r['office']:<35} {(r['party'] or ''):<12} {(r['county'] or ''):<15} {(r['email'] or ''):<30} {r['outreach_status']}")

    print(f"\nTotal: {len(rows)} candidates")
    with_email = sum(1 for r in rows if r["email"])
    print(f"With email: {with_email}")


def main():
    parser = argparse.ArgumentParser(description="Find candidate emails from public sources")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Import command
    import_parser = subparsers.add_parser("import", help="Import candidates from CSV")
    import_parser.add_argument("csv_path", help="Path to candidates CSV")
    import_parser.add_argument("--then-search", action="store_true",
                               help="After importing, search for emails")

    # Search command
    search_parser = subparsers.add_parser("search", help="Search for emails")
    search_parser.add_argument("--limit", type=int, default=None,
                               help="Max candidates to search")

    # List command
    list_parser = subparsers.add_parser("list", help="List all candidates")
    list_parser.add_argument("--county", default=None, help="Filter by county")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    conn = get_db()
    print(f"Database: {os.path.abspath(DB_PATH)}")

    try:
        if args.command == "import":
            import_candidates_from_csv(args.csv_path, conn)
            if args.then_search:
                search_all_candidates(conn)
        elif args.command == "search":
            search_all_candidates(conn, limit=args.limit)
        elif args.command == "list":
            list_candidates(conn, county=getattr(args, "county", None))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
