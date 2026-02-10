#!/usr/bin/env node
/**
 * Orchestrates scraping + processing for a single order.
 *
 * Usage:
 *   node scripts/scrape-order.mjs --orderId <uuid>
 *
 * Reads the order from local SQLite, runs the Python VoteRef scraper for each
 * county/precinct, concatenates results, then POSTs to /api/admin/process.
 */

import Database from "better-sqlite3";
import { spawn } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const orderIdIdx = args.indexOf("--orderId");
const orderId = orderIdIdx !== -1 ? args[orderIdIdx + 1] : null;

if (!orderId) {
  console.error("Usage: node scripts/scrape-order.mjs --orderId <uuid>");
  process.exit(1);
}

// ── SQLite ────────────────────────────────────────────────────────────
const DB_PATH = resolve(ROOT, "data", "votemapper.db");
if (!existsSync(DB_PATH)) {
  console.error(`Database not found at ${DB_PATH}`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ── Helpers ───────────────────────────────────────────────────────────

function updateOrderStatus(status) {
  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, orderId);
}

function runScraper(state, county, precinct) {
  return new Promise((resolve, reject) => {
    const scriptPath = `${ROOT}/scripts/scrape_voteref.py`;
    const args = ["--state", state, "--county", county];
    if (precinct) args.push("--precinct", precinct);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`Scraping: state=${state} county=${county}${precinct ? ` precinct=${precinct}` : ""}`);
    console.log(`${"=".repeat(60)}\n`);

    const child = spawn("python3", [scriptPath, ...args], {
      stdio: "inherit",
      cwd: ROOT,
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Scraper exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start scraper: ${err.message}`));
    });
  });
}

function buildCsvPath(state, county, precinct) {
  const base = `data/voteref-${state.toLowerCase()}-${county.toLowerCase().replace(/\s+/g, "-")}`;
  return precinct ? `${base}-${precinct}` : base;
}

function readCsvIfExists(filePath) {
  const fullPath = resolve(ROOT, filePath);
  if (existsSync(fullPath)) {
    return readFileSync(fullPath, "utf-8");
  }
  return null;
}

function concatenateCsvs(csvContents) {
  if (csvContents.length === 0) return "";
  if (csvContents.length === 1) return csvContents[0];

  // First CSV keeps its header; subsequent CSVs skip the first line
  const lines = [];
  csvContents.forEach((csv, idx) => {
    const csvLines = csv.split("\n").filter((l) => l.trim());
    if (idx === 0) {
      lines.push(...csvLines);
    } else {
      lines.push(...csvLines.slice(1)); // skip header
    }
  });
  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nScrape-Order: orderId=${orderId}`);

  // 1. Fetch order
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);

  if (!order) {
    console.error("Order not found");
    process.exit(1);
  }

  console.log(`Order: ${order.customer_email}`);
  console.log(`  State: ${order.state}`);
  console.log(`  Counties: ${order.county}`);
  console.log(`  Precincts: ${order.precinct || "(all)"}`);
  console.log(`  Status: ${order.status}`);

  if (order.status !== "paid") {
    console.error(`Order status is '${order.status}', expected 'paid'. Aborting.`);
    process.exit(1);
  }

  // Update status to scraping
  updateOrderStatus("scraping");

  // 2. Parse counties and precincts
  const counties = order.county.split(",").map((c) => c.trim()).filter(Boolean);
  const precincts = order.precinct
    ? order.precinct.split(",").map((p) => p.trim()).filter(Boolean)
    : [];

  // 3. Run scraper for each county/precinct combination
  const csvPaths = [];
  const historyCsvPaths = [];

  try {
    if (precincts.length > 0) {
      for (const county of counties) {
        for (const precinct of precincts) {
          await runScraper(order.state, county, precinct);
          const basePath = buildCsvPath(order.state, county, precinct);
          csvPaths.push(`${basePath}.csv`);
          historyCsvPaths.push(`${basePath}-history.csv`);
        }
      }
    } else {
      for (const county of counties) {
        await runScraper(order.state, county, null);
        const basePath = buildCsvPath(order.state, county, null);
        csvPaths.push(`${basePath}.csv`);
        historyCsvPaths.push(`${basePath}-history.csv`);
      }
    }
  } catch (err) {
    console.error("\nScraping failed:", err.message);
    updateOrderStatus("scrape_failed");
    process.exit(1);
  }

  // 4. Read and concatenate CSV files
  console.log("\n" + "=".repeat(60));
  console.log("Reading scraped CSV files...");

  const voterCsvs = [];
  for (const p of csvPaths) {
    const content = readCsvIfExists(p);
    if (content) {
      const lineCount = content.split("\n").filter((l) => l.trim()).length - 1;
      console.log(`  ${p}: ${lineCount} voters`);
      voterCsvs.push(content);
    } else {
      console.warn(`  ${p}: NOT FOUND (skipping)`);
    }
  }

  if (voterCsvs.length === 0) {
    console.error("No voter CSVs found after scraping. Aborting.");
    updateOrderStatus("scrape_failed");
    process.exit(1);
  }

  const historyCsvs = [];
  for (const p of historyCsvPaths) {
    const content = readCsvIfExists(p);
    if (content) {
      historyCsvs.push(content);
    }
  }

  const voterCsv = concatenateCsvs(voterCsvs);
  const historyCsv = historyCsvs.length > 0 ? concatenateCsvs(historyCsvs) : undefined;

  const totalVoters = voterCsv.split("\n").filter((l) => l.trim()).length - 1;
  console.log(`\nTotal: ${totalVoters} voters across ${voterCsvs.length} file(s)`);

  // 5. POST to process endpoint
  console.log("\n" + "=".repeat(60));
  console.log("Processing: geocoding, clustering, routing...");
  updateOrderStatus("processing");

  const processUrl = `http://localhost:${process.env.PORT || 3000}/api/admin/process`;
  const payload = { orderId, voterCsv };
  if (historyCsv) payload.historyCsv = historyCsv;

  try {
    const res = await fetch(processUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error("Processing failed:", result.error || res.statusText);
      updateOrderStatus("process_failed");
      process.exit(1);
    }

    console.log("\nProcessing complete!");
    console.log(`  Slug: ${result.slug}`);
    console.log(`  Voters: ${result.voterCount}`);
    console.log(`  Geocoded: ${result.geocodedCount}`);
    console.log(`  Routes: ${result.routeCount}`);
    console.log(`\nCampaign URL: /c/${result.slug}`);
  } catch (err) {
    console.error("Failed to call process endpoint:", err.message);
    updateOrderStatus("process_failed");
    process.exit(1);
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  try { updateOrderStatus("error"); } catch {}
  process.exit(1);
});
