"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PasswordGate({ slug }: { slug: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/campaign-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, password: password.trim() }),
      });

      if (res.ok) {
        router.refresh();
      } else {
        setError("Wrong password. Please try again.");
      }
    } catch {
      setError("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-xs">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-900 tracking-tight">VoteMapper</span>
          </div>

          <h1 className="text-sm font-semibold text-slate-900">Campaign protected</h1>
          <p className="mt-1 text-xs text-slate-400">
            Enter the password to view this campaign.
          </p>

          <form onSubmit={handleSubmit} className="mt-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />

            {error && (
              <p className="mt-2 text-xs text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-3 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Checking..." : "View Campaign"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
