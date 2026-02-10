#!/usr/bin/env node
/**
 * One-time scraping script: Extract county + precinct data from voteref.com
 * for Texas counties with <50k population.
 *
 * Usage:
 *   npx playwright install chromium   # first time only
 *   node scripts/scrape-voteref.mjs
 *
 * Output:
 *   src/data/tx-counties.json    — sorted array of county names (<50k pop)
 *   src/data/tx-precincts.json   — { county: ["precinct1", ...] } mapping
 */

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "src", "data");

// All 254 TX counties with 2020 Census populations.
// Counties with population >= 50000 are excluded from our target set.
const TX_COUNTIES = {
  Anderson: 57863,
  Andrews: 18610,
  Angelina: 86395,
  Aransas: 23830,
  Archer: 8553,
  Armstrong: 1848,
  Atascosa: 51153,
  Austin: 30032,
  Bailey: 7000,
  Bandera: 23112,
  Bastrop: 97216,
  Baylor: 3509,
  Bee: 32565,
  Bell: 370647,
  Bexar: 2009324,
  Blanco: 12183,
  Borden: 631,
  Bosque: 18685,
  Bowie: 93858,
  Brazoria: 372477,
  Brazos: 233849,
  Brewster: 9546,
  Briscoe: 1492,
  Brooks: 7076,
  Brown: 37864,
  Burleson: 18443,
  Burnet: 48155,
  Caldwell: 45883,
  Calhoun: 21290,
  Callahan: 13943,
  Cameron: 423163,
  Camp: 13094,
  Carson: 5926,
  Cass: 30026,
  Castro: 7371,
  Chambers: 46571,
  Cherokee: 52646,
  Childress: 6664,
  Clay: 10471,
  Cochran: 2548,
  Coke: 3210,
  Coleman: 8175,
  Collin: 1064465,
  Collingsworth: 2816,
  Colorado: 21493,
  Comal: 161501,
  Comanche: 13547,
  Concho: 2726,
  Cooke: 41668,
  Coryell: 75951,
  Cottle: 1380,
  Crane: 4797,
  Crockett: 3098,
  Crosby: 5218,
  Culberson: 2171,
  Dallam: 7287,
  Dallas: 2613539,
  Dawson: 12728,
  "Deaf Smith": 18546,
  Delta: 5277,
  Denton: 906422,
  DeWitt: 20160,
  Dickens: 2211,
  Dimmit: 10124,
  Donley: 3278,
  Duval: 10975,
  Eastland: 18360,
  Ector: 165171,
  Edwards: 1917,
  "El Paso": 865657,
  Ellis: 192455,
  Erath: 42698,
  Falls: 17297,
  Fannin: 35662,
  Fayette: 25346,
  Fisher: 3778,
  Floyd: 5440,
  Foard: 1095,
  "Fort Bend": 822779,
  Franklin: 10560,
  Freestone: 19435,
  Frio: 20306,
  Gaines: 21458,
  Galveston: 350682,
  Garza: 6211,
  Gillespie: 27006,
  Glasscock: 1226,
  Goliad: 7658,
  Gonzales: 20837,
  Gray: 21886,
  Grayson: 136212,
  Gregg: 123945,
  Grimes: 28880,
  Guadalupe: 172706,
  Hale: 33362,
  Hall: 2895,
  Hamilton: 8461,
  Hansford: 5285,
  Hardeman: 3677,
  Hardin: 57602,
  Harris: 4731145,
  Harrison: 66645,
  Hartley: 5382,
  Haskell: 5416,
  Hays: 241067,
  Hemphill: 3819,
  Henderson: 82737,
  Hidalgo: 870781,
  Hill: 36649,
  Hockley: 22986,
  Hood: 61598,
  Hopkins: 37084,
  Houston: 22066,
  Howard: 36664,
  Hudspeth: 4732,
  Hunt: 98594,
  Hutchinson: 20617,
  Irion: 1513,
  Jack: 8535,
  Jackson: 14760,
  Jasper: 35504,
  "Jeff Davis": 2234,
  Jefferson: 256526,
  "Jim Hogg": 5200,
  "Jim Wells": 39326,
  Johnson: 179927,
  Jones: 19817,
  Karnes: 15601,
  Kaufman: 145310,
  Kendall: 47431,
  Kenedy: 350,
  Kent: 749,
  Kerr: 52600,
  Kimble: 4337,
  King: 265,
  Kinney: 3667,
  Kleberg: 30680,
  Knox: 3664,
  Lamar: 50484,
  Lamb: 12893,
  Lampasas: 22580,
  "La Salle": 7520,
  Lavaca: 20154,
  Lee: 17478,
  Leon: 17404,
  Liberty: 91628,
  Limestone: 23437,
  Lipscomb: 3189,
  "Live Oak": 12207,
  Llano: 21795,
  Loving: 64,
  Lubbock: 310569,
  Lynn: 5596,
  Madison: 14284,
  Marion: 9854,
  Martin: 5771,
  Mason: 4012,
  Matagorda: 36643,
  Maverick: 58722,
  McCulloch: 7984,
  McLennan: 260579,
  McMullen: 584,
  Medina: 51584,
  Menard: 2093,
  Midland: 171932,
  Milam: 24823,
  Mills: 4900,
  Mitchell: 8343,
  Montague: 19818,
  Montgomery: 620443,
  Moore: 20940,
  Morris: 12388,
  Motley: 1063,
  Nacogdoches: 65204,
  Navarro: 50113,
  Newton: 13595,
  Nolan: 14714,
  Nueces: 353178,
  Ochiltree: 9582,
  Oldham: 1758,
  Orange: 84808,
  "Palo Pinto": 29189,
  Panola: 23194,
  Parker: 148222,
  Parmer: 9605,
  Pecos: 15823,
  Polk: 51353,
  Potter: 117415,
  Presidio: 6131,
  Rains: 12440,
  Randall: 137772,
  Reagan: 3385,
  Real: 3389,
  "Red River": 11952,
  Reeves: 15976,
  Refugio: 6948,
  Roberts: 826,
  Robertson: 17074,
  Rockwall: 107819,
  Runnels: 10264,
  Rusk: 54406,
  Sabine: 10542,
  "San Augustine": 8237,
  "San Jacinto": 28859,
  "San Patricio": 67408,
  "San Saba": 5730,
  Schleicher: 2793,
  Scurry: 17239,
  Shackelford: 3265,
  Shelby: 25448,
  Sherman: 2896,
  Smith: 232751,
  Somervell: 9128,
  Starr: 64633,
  Stephens: 9366,
  Sterling: 1143,
  Stonewall: 1245,
  Sutton: 3372,
  Swisher: 7397,
  Tarrant: 2110640,
  Taylor: 143208,
  Terrell: 760,
  Terry: 12327,
  Throckmorton: 1500,
  Titus: 32730,
  "Tom Green": 119200,
  Travis: 1290188,
  Trinity: 14651,
  Tyler: 21680,
  Upshur: 41753,
  Upton: 3308,
  Uvalde: 26899,
  "Val Verde": 48508,
  "Van Zandt": 56590,
  Victoria: 92084,
  Walker: 76400,
  Waller: 56794,
  Ward: 11998,
  Washington: 35882,
  Webb: 267114,
  Wharton: 41556,
  Wheeler: 5049,
  Wichita: 132230,
  Wilbarger: 12769,
  Willacy: 21358,
  Williamson: 609017,
  Wilson: 51070,
  Winkler: 8010,
  Wise: 69984,
  Wood: 45539,
  Yoakum: 8713,
  Young: 17951,
  Zapata: 14369,
  Zavala: 11370,
};

// Filter to counties with population < 50000
const TARGET_COUNTIES = Object.entries(TX_COUNTIES)
  .filter(([, pop]) => pop < 50000)
  .map(([name]) => name)
  .sort();

console.log(
  `Target: ${TARGET_COUNTIES.length} TX counties with <50k population\n`
);

const SEARCH_NAMES = ["John Smith", "Maria Garcia", "James Johnson"];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Wait for Cloudflare challenge to clear (up to timeout ms).
 */
async function waitForCloudflare(page, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const title = await page.title();
    if (
      title.toLowerCase().includes("just a moment") ||
      title.toLowerCase().includes("attention required")
    ) {
      console.log("  Waiting for Cloudflare...");
      await sleep(3000);
      continue;
    }
    const bodyLen = await page.evaluate(
      () => document.body?.textContent?.length || 0
    );
    if (bodyLen > 200) return true;
    await sleep(1000);
  }
  return false;
}

/**
 * Dismiss any popup/terms dialog on the page.
 */
async function dismissPopups(page) {
  const labels = [
    "I Agree",
    "Accept",
    "I Accept",
    "Agree & Continue",
    "Continue",
    "OK",
    "I understand",
    "Close",
  ];
  await sleep(500);
  for (const label of labels) {
    for (const tag of ["button", "a"]) {
      try {
        const el = await page.$(
          `${tag}:has-text("${label}")`
        );
        if (el && (await el.isVisible())) {
          await el.click();
          console.log(`  Dismissed popup: ${label}`);
          await sleep(300);
          return;
        }
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Extract county names from the county filter sidebar.
 */
async function extractCountyNames(page) {
  // Expand county filter if collapsed
  try {
    const collapseBtn = await page.$(
      '#counties-filter-items-collapse:not(.show)'
    );
    if (collapseBtn) {
      const toggle = await page.$(
        '[data-bs-target="#counties-filter-items-collapse"], [href="#counties-filter-items-collapse"]'
      );
      if (toggle) {
        await toggle.click();
        await sleep(500);
      }
    }
  } catch {
    // already expanded or different structure
  }

  // Also try clicking "Show All" if it exists
  try {
    const showAll = await page.$('#counties-filter-items-collapse .show-all-link');
    if (showAll && await showAll.isVisible()) {
      await showAll.click();
      await sleep(500);
    }
  } catch {
    // ignore
  }

  const names = await page.$$eval(
    "#counties-filter-items-collapse a",
    (links) =>
      links
        .map((a) => {
          // Text is like "Armstrong (5)" — extract just the name
          const text = a.textContent?.trim() || "";
          return text.replace(/\s*\(\d+\)\s*$/, "").trim();
        })
        .filter(Boolean)
  );
  return [...new Set(names)];
}

/**
 * Extract precinct codes from the precinct filter sidebar.
 */
async function extractPrecinctCodes(page) {
  // Expand precinct filter if collapsed
  try {
    const collapseBtn = await page.$(
      '#precinctCodes-filter-items-collapse:not(.show)'
    );
    if (collapseBtn) {
      const toggle = await page.$(
        '[data-bs-target="#precinctCodes-filter-items-collapse"], [href="#precinctCodes-filter-items-collapse"]'
      );
      if (toggle) {
        await toggle.click();
        await sleep(500);
      }
    }
  } catch {
    // already expanded or different structure
  }

  // Also try clicking "Show All" if it exists
  try {
    const showAll = await page.$('#precinctCodes-filter-items-collapse .show-all-link');
    if (showAll && await showAll.isVisible()) {
      await showAll.click();
      await sleep(500);
    }
  } catch {
    // ignore
  }

  const codes = await page.$$eval(
    "#precinctCodes-filter-items-collapse a",
    (links) =>
      links
        .map((a) => {
          const text = a.textContent?.trim() || "";
          return text.replace(/\s*\(\d+\)\s*$/, "").trim();
        })
        .filter(Boolean)
  );
  return [...new Set(codes)].sort();
}

/**
 * Click a county checkbox in the filter sidebar to toggle it.
 */
async function toggleCountyFilter(page, countyName) {
  const links = await page.$$("#counties-filter-items-collapse a");
  for (const link of links) {
    const text = await link.textContent();
    const name = (text || "").replace(/\s*\(\d+\)\s*$/, "").trim();
    if (name === countyName) {
      await link.click();
      // Wait for the page to update (network request + DOM update)
      await sleep(1500);
      try {
        await page.waitForLoadState("networkidle", { timeout: 5000 });
      } catch {
        // timeout is fine, might not go fully idle
      }
      return true;
    }
  }
  return false;
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  const precinctMap = {}; // county -> string[]
  const foundCounties = new Set();
  const failedCounties = [];

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  for (const searchName of SEARCH_NAMES) {
    // Check if we still have counties to find
    const remaining = TARGET_COUNTIES.filter((c) => !foundCounties.has(c));
    if (remaining.length === 0) {
      console.log("All target counties found!");
      break;
    }

    console.log(
      `\nSearching "${searchName}" — ${remaining.length} counties remaining...`
    );

    const url = `https://voteref.com/voters?state=TX&search=${encodeURIComponent(searchName)}`;
    await page.goto(url, { timeout: 60000 });
    await waitForCloudflare(page);
    await dismissPopups(page);

    // Wait for the table to appear
    try {
      await page.waitForSelector("table", { timeout: 15000 });
    } catch {
      console.log("  No table found, trying manual wait...");
      await sleep(5000);
    }

    // Expand county filter + extract visible counties
    const visibleCounties = await extractCountyNames(page);
    console.log(`  Found ${visibleCounties.length} counties in filter`);

    // Find which target counties appear in this search
    const targetVisible = visibleCounties.filter(
      (c) => TARGET_COUNTIES.includes(c) && !foundCounties.has(c)
    );
    console.log(
      `  ${targetVisible.length} new target counties to scrape precincts for`
    );

    for (let i = 0; i < targetVisible.length; i++) {
      const county = targetVisible[i];
      console.log(
        `  [${i + 1}/${targetVisible.length}] ${county}...`
      );

      // Click county to filter
      const clicked = await toggleCountyFilter(page, county);
      if (!clicked) {
        console.log(`    Could not click ${county}, skipping`);
        failedCounties.push(county);
        continue;
      }

      // Extract precincts
      const precinctCodes = await extractPrecinctCodes(page);
      console.log(`    ${precinctCodes.length} precincts`);

      precinctMap[county] = precinctCodes;
      foundCounties.add(county);

      // Deselect county
      await toggleCountyFilter(page, county);
      await sleep(500);
    }
  }

  await browser.close();

  // Counties that appeared in no search
  const missing = TARGET_COUNTIES.filter((c) => !foundCounties.has(c));
  if (missing.length > 0) {
    console.log(
      `\nWarning: ${missing.length} counties not found in any search:`
    );
    console.log(`  ${missing.join(", ")}`);
    // Still include them with empty precinct arrays
    for (const c of missing) {
      precinctMap[c] = [];
    }
  }

  // Sort the final county list (only found + missing that are in target)
  const allCounties = TARGET_COUNTIES.filter(
    (c) => foundCounties.has(c) || missing.includes(c)
  ).sort();

  // Sort precinct map by county name
  const sortedPrecinctMap = {};
  for (const c of allCounties) {
    sortedPrecinctMap[c] = (precinctMap[c] || []).sort();
  }

  // Write output files
  const countiesPath = join(DATA_DIR, "tx-counties.json");
  const precinctsPath = join(DATA_DIR, "tx-precincts.json");

  writeFileSync(countiesPath, JSON.stringify(allCounties, null, 2) + "\n");
  writeFileSync(
    precinctsPath,
    JSON.stringify(sortedPrecinctMap, null, 2) + "\n"
  );

  console.log(`\nDone!`);
  console.log(`  Counties: ${allCounties.length} → ${countiesPath}`);
  console.log(
    `  Precincts: ${Object.keys(sortedPrecinctMap).length} counties → ${precinctsPath}`
  );
  console.log(
    `  Total precincts: ${Object.values(sortedPrecinctMap).reduce((s, a) => s + a.length, 0)}`
  );

  if (failedCounties.length > 0) {
    console.log(`  Failed to click: ${failedCounties.join(", ")}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
