import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";

// ── Types (re-exported, previously in supabase.ts) ──────────────────

export interface OrderRow {
  id: string;
  stripe_session_id: string | null;
  customer_email: string;
  customer_name: string | null;
  state: string;
  county: string;
  precinct: string | null;
  tier: string;
  amount_cents: number;
  status: string;
  slug: string | null;
  password: string | null;
  created_at: string;
}

export interface CampaignRow {
  id: string;
  order_id: string | null;
  slug: string;
  title: string;
  state: string;
  county: string;
  precinct: string | null;
  voter_count: number;
  geocoded_count: number;
  route_count: number;
  center_lat: number | null;
  center_lng: number | null;
  data: CampaignData;
  password: string | null;
  created_at: string;
}

export interface CampaignData {
  voters: import("./types").Voter[];
  geocodedVoters: import("./types").GeocodedVoter[];
  unmatchedVoters: import("./types").Voter[];
  routes: import("./types").WalkerRoute[];
  numWalkers: number;
}

interface CandidateRow {
  id: string;
  name: string;
  office: string;
  county: string | null;
  state: string;
  email: string | null;
  outreach_status: string;
  created_at: string;
}

// ── Singleton DB instance ───────────────────────────────────────────

const DB_PATH = path.resolve(process.cwd(), "data", "votemapper.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  // Ensure data directory exists
  const dir = path.dirname(DB_PATH);
  const fs = require("fs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Auto-create tables
  _db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      stripe_session_id TEXT UNIQUE,
      customer_email TEXT NOT NULL,
      customer_name TEXT,
      state TEXT NOT NULL DEFAULT '',
      county TEXT NOT NULL DEFAULT '',
      precinct TEXT,
      tier TEXT NOT NULL DEFAULT 'precinct',
      amount_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      slug TEXT,
      password TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      order_id TEXT REFERENCES orders(id),
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      county TEXT NOT NULL DEFAULT '',
      precinct TEXT,
      voter_count INTEGER NOT NULL DEFAULT 0,
      geocoded_count INTEGER NOT NULL DEFAULT 0,
      route_count INTEGER NOT NULL DEFAULT 0,
      center_lat REAL,
      center_lng REAL,
      data TEXT NOT NULL DEFAULT '{}',
      password TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      office TEXT NOT NULL DEFAULT '',
      county TEXT,
      state TEXT NOT NULL DEFAULT '',
      email TEXT,
      outreach_status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS outreach_log (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      candidate_id TEXT REFERENCES candidates(id),
      subject TEXT,
      resend_id TEXT,
      status TEXT NOT NULL DEFAULT 'sent',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return _db;
}

// ── Orders ──────────────────────────────────────────────────────────

export function getOrderById(id: string): OrderRow | undefined {
  return getDb().prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined;
}

export function getAllOrders(): OrderRow[] {
  return getDb().prepare("SELECT * FROM orders ORDER BY created_at DESC").all() as OrderRow[];
}

export function getOrderByStripeSessionId(sessionId: string): { id: string } | undefined {
  return getDb()
    .prepare("SELECT id FROM orders WHERE stripe_session_id = ?")
    .get(sessionId) as { id: string } | undefined;
}

export function getOrderStatus(id: string): { status: string; slug: string | null } | undefined {
  return getDb()
    .prepare("SELECT status, slug FROM orders WHERE id = ?")
    .get(id) as { status: string; slug: string | null } | undefined;
}

export function insertOrder(order: {
  stripe_session_id?: string | null;
  customer_email: string;
  customer_name?: string | null;
  state: string;
  county: string;
  precinct?: string | null;
  tier: string;
  amount_cents: number;
  status: string;
  slug?: string | null;
  password?: string | null;
}): string {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO orders (id, stripe_session_id, customer_email, customer_name, state, county, precinct, tier, amount_cents, status, slug, password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      order.stripe_session_id ?? null,
      order.customer_email,
      order.customer_name ?? null,
      order.state,
      order.county,
      order.precinct ?? null,
      order.tier,
      order.amount_cents,
      order.status,
      order.slug ?? null,
      order.password ?? null
    );
  return id;
}

export function updateOrderStatus(id: string, status: string): void {
  getDb().prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
}

export function updateOrderStatusAndSlug(id: string, status: string, slug: string): void {
  getDb().prepare("UPDATE orders SET status = ?, slug = ? WHERE id = ?").run(status, slug, id);
}

// Conditional update: only update if current status matches
export function updateOrderStatusIf(id: string, newStatus: string, ifStatus: string): void {
  getDb()
    .prepare("UPDATE orders SET status = ? WHERE id = ? AND status = ?")
    .run(newStatus, id, ifStatus);
}

// ── Campaigns ───────────────────────────────────────────────────────

export function getCampaignBySlug(slug: string): CampaignRow | undefined {
  const row = getDb().prepare("SELECT * FROM campaigns WHERE slug = ?").get(slug) as
    | (Omit<CampaignRow, "data"> & { data: string })
    | undefined;
  if (!row) return undefined;
  return { ...row, data: JSON.parse(row.data) };
}

export function getCampaignPasswordBySlug(slug: string): { password: string | null } | undefined {
  return getDb()
    .prepare("SELECT password FROM campaigns WHERE slug = ?")
    .get(slug) as { password: string | null } | undefined;
}

/** Returns true on success, false on unique constraint violation (slug collision). */
export function insertCampaign(campaign: {
  order_id?: string | null;
  slug: string;
  title: string;
  state: string;
  county: string;
  precinct?: string | null;
  voter_count: number;
  geocoded_count: number;
  route_count: number;
  center_lat: number | null;
  center_lng: number | null;
  data: CampaignData;
  password?: string | null;
}): boolean {
  const id = crypto.randomUUID();
  try {
    getDb()
      .prepare(
        `INSERT INTO campaigns (id, order_id, slug, title, state, county, precinct, voter_count, geocoded_count, route_count, center_lat, center_lng, data, password)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        campaign.order_id ?? null,
        campaign.slug,
        campaign.title,
        campaign.state,
        campaign.county,
        campaign.precinct ?? null,
        campaign.voter_count,
        campaign.geocoded_count,
        campaign.route_count,
        campaign.center_lat,
        campaign.center_lng,
        JSON.stringify(campaign.data),
        campaign.password ?? null
      );
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
      return false;
    }
    throw err;
  }
}

// ── Candidates ──────────────────────────────────────────────────────

export function getCandidates(filters?: {
  county?: string;
  status?: string;
}): CandidateRow[] {
  let sql = "SELECT * FROM candidates";
  const conditions: string[] = [];
  const params: string[] = [];

  if (filters?.county) {
    conditions.push("county = ?");
    params.push(filters.county);
  }
  if (filters?.status) {
    conditions.push("outreach_status = ?");
    params.push(filters.status);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  sql += " ORDER BY created_at DESC";

  return getDb().prepare(sql).all(...params) as CandidateRow[];
}

export function getCandidateById(id: string): CandidateRow | undefined {
  return getDb().prepare("SELECT * FROM candidates WHERE id = ?").get(id) as
    | CandidateRow
    | undefined;
}

/** Update outreach_status only if current status matches ifStatus. */
export function updateCandidateStatusIfNew(id: string, newStatus: string): void {
  getDb()
    .prepare("UPDATE candidates SET outreach_status = ? WHERE id = ? AND outreach_status = 'new'")
    .run(newStatus, id);
}

// ── Outreach Log ────────────────────────────────────────────────────

export function insertOutreachLog(log: {
  candidate_id: string;
  subject: string;
  resend_id: string | null;
  status: string;
}): void {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO outreach_log (id, candidate_id, subject, resend_id, status) VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, log.candidate_id, log.subject, log.resend_id, log.status);
}

export function updateOutreachLogStatusByResendId(resendId: string, status: string): void {
  getDb().prepare("UPDATE outreach_log SET status = ? WHERE resend_id = ?").run(status, resendId);
}
