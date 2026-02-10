"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import MultiSelect from "@/components/MultiSelect";
import txCounties from "@/data/tx-counties.json";
import txPrecincts from "@/data/tx-precincts.json";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

const precinctMap = txPrecincts as Record<string, string[]>;

function estimatePrice(counties: string[], precincts: string[]) {
  return 29 + counties.length * 10 + precincts.length * 5;
}

export default function LandingPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [state, setState] = useState("");
  const [counties, setCounties] = useState<string[]>([]);
  const [precincts, setPrecincts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const availablePrecincts = useMemo(() => {
    if (counties.length === 0) return [];
    const all = new Set<string>();
    for (const c of counties) {
      for (const p of precinctMap[c] ?? []) {
        all.add(p);
      }
    }
    return [...all].sort();
  }, [counties]);

  function handleCountiesChange(next: string[]) {
    setCounties(next);
    // Remove precincts that are no longer available
    const nextAvailable = new Set<string>();
    for (const c of next) {
      for (const p of precinctMap[c] ?? []) {
        nextAvailable.add(p);
      }
    }
    setPrecincts((prev) => prev.filter((p) => nextAvailable.has(p)));
  }

  const price = estimatePrice(counties, precincts);

  async function handleCheckout() {
    if (!email || !state || counties.length === 0) {
      setError("Please fill in your email, state, and at least one county.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, state, counties, precincts }),
      });
      const data = await res.json();
      if (data.slug && data.password) {
        router.push(`/success?slug=${data.slug}&password=${encodeURIComponent(data.password)}&orderId=${data.orderId}`);
      } else {
        setError(data.error || "Something went wrong.");
      }
    } catch {
      setError("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-900 tracking-tight">VoteMapper</span>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-16 pb-12">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 leading-tight">
            Optimized walk routes for your campaign
          </h1>
          <p className="mt-3 text-base text-slate-500 leading-relaxed max-w-lg">
            Get voter data mapped, scored, and routed for door-knocking.
            Share an interactive map with your volunteers — no app downloads, no logins.
          </p>
        </div>
      </section>

      {/* Order Form */}
      <section id="order" className="mx-auto max-w-5xl px-6 pb-20">
        <div className="rounded-lg border border-slate-200 bg-white p-6 max-w-lg">
          <h2 className="text-sm font-semibold text-slate-900">Get started</h2>
          <p className="mt-1 text-xs text-slate-400">
            Tell us your campaign area. We&apos;ll prepare your data within 24 hours.
          </p>

          <div className="mt-5 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@campaign.com"
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
              <div className="relative">
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full appearance-none rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                >
                  <option value="">Select state</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 4.5 6 7.5 9 4.5" />
                </svg>
              </div>
            </div>

            {/* Counties */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Counties</label>
              <MultiSelect
                options={txCounties}
                selected={counties}
                onChange={handleCountiesChange}
                placeholder="Search counties..."
              />
            </div>

            {/* Precincts */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Precincts <span className="text-slate-300">(optional)</span>
              </label>
              <MultiSelect
                options={availablePrecincts}
                selected={precincts}
                onChange={setPrecincts}
                placeholder={counties.length === 0 ? "Select counties first" : "Search precincts..."}
                disabled={counties.length === 0}
                tagColor="slate"
              />
            </div>
          </div>

          {/* Price estimate */}
          {counties.length > 0 && (
            <div className="mt-4 rounded-md bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
              Estimated: <span className="font-medium text-slate-700">${price}</span>
              <span className="text-slate-400"> · {counties.length} {counties.length === 1 ? "county" : "counties"}{precincts.length > 0 ? ` · ${precincts.length} ${precincts.length === 1 ? "precinct" : "precincts"}` : ""}</span>
            </div>
          )}

          {error && (
            <p className="mt-3 text-xs text-red-600">{error}</p>
          )}

          <button
            onClick={handleCheckout}
            disabled={loading}
            className="mt-5 w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Placing order..." : `Place Order${counties.length > 0 ? ` — $${price}` : ""}`}
          </button>

          <p className="mt-3 text-center text-[11px] text-slate-400">
            Data delivered within 24 hours.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-6 flex items-center justify-between">
          <span className="text-xs text-slate-400">VoteMapper</span>
          <span className="text-xs text-slate-300">Optimized routes for every door.</span>
        </div>
      </footer>
    </div>
  );
}
