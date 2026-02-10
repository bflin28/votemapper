"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Candidate {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  office: string;
  party: string | null;
  county: string | null;
  state: string;
  election_date: string | null;
  election_type: string | null;
  source_url: string | null;
  outreach_status: string;
  notes: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  new: "bg-slate-100 text-slate-600",
  emailed: "bg-blue-50 text-blue-700",
  replied: "bg-amber-50 text-amber-700",
  converted: "bg-green-50 text-green-700",
};

export default function OutreachDashboard() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCounty, setFilterCounty] = useState("");
  const [demoSlug, setDemoSlug] = useState("");

  useEffect(() => {
    loadCandidates();
  }, [filterStatus, filterCounty]);

  async function loadCandidates() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterCounty) params.set("county", filterCounty);

    const res = await fetch(`/api/admin/outreach?${params}`);
    const data = await res.json();
    setCandidates(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function handleSend(candidateId: string) {
    setSending(candidateId);
    try {
      const res = await fetch("/api/admin/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, demoSlug: demoSlug || undefined }),
      });
      if (res.ok) {
        setCandidates((prev) =>
          prev.map((c) =>
            c.id === candidateId ? { ...c, outreach_status: "emailed" } : c
          )
        );
      } else {
        const err = await res.json();
        alert(err.error || "Failed to send");
      }
    } catch {
      alert("Failed to send email");
    } finally {
      setSending(null);
    }
  }

  const counties = [...new Set(candidates.map((c) => c.county).filter(Boolean))] as string[];

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-xs text-slate-400 hover:text-slate-600">
              &larr; Orders
            </Link>
            <span className="text-xs text-slate-300">/</span>
            <span className="text-sm font-semibold text-slate-900">Outreach</span>
          </div>
          <span className="text-xs text-slate-400 tabular-nums font-mono">
            {candidates.length} candidates
          </span>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="inline-flex appearance-none items-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-1.5 pr-7 text-xs font-medium text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All statuses</option>
              <option value="new">New</option>
              <option value="emailed">Emailed</option>
              <option value="replied">Replied</option>
              <option value="converted">Converted</option>
            </select>
            <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 4.5 6 7.5 9 4.5" />
            </svg>
          </div>

          {counties.length > 0 && (
            <div className="relative">
              <select
                value={filterCounty}
                onChange={(e) => setFilterCounty(e.target.value)}
                className="inline-flex appearance-none items-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 py-1.5 pr-7 text-xs font-medium text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="">All counties</option>
                {counties.sort().map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 4.5 6 7.5 9 4.5" />
              </svg>
            </div>
          )}

          <div className="ml-auto">
            <input
              type="text"
              value={demoSlug}
              onChange={(e) => setDemoSlug(e.target.value)}
              placeholder="Demo slug (optional)"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-300 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <p className="mt-8 text-sm text-slate-400">Loading...</p>
        ) : candidates.length === 0 ? (
          <p className="mt-8 text-sm text-slate-400">No candidates found.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Office</th>
                  <th className="pb-2 pr-4 font-medium">County</th>
                  <th className="pb-2 pr-4 font-medium">Party</th>
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 pr-4 font-medium">Election</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-4 font-medium text-slate-900">{c.name}</td>
                    <td className="py-2.5 pr-4 text-slate-700">{c.office}</td>
                    <td className="py-2.5 pr-4 text-slate-700">{c.county || "—"}</td>
                    <td className="py-2.5 pr-4">
                      {c.party ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          {c.party}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-slate-600">
                      {c.email || <span className="text-slate-300">none</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-500 tabular-nums font-mono">
                      {c.election_date
                        ? new Date(c.election_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[c.outreach_status] || STATUS_STYLES.new}`}
                      >
                        {c.outreach_status}
                      </span>
                    </td>
                    <td className="py-2.5">
                      {c.email && c.outreach_status === "new" ? (
                        <button
                          onClick={() => handleSend(c.id)}
                          disabled={sending === c.id}
                          className="rounded-md bg-slate-900 px-3 py-1 text-[10px] font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {sending === c.id ? "Sending..." : "Send"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
