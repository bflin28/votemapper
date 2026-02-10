"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/admin");
      } else {
        const data = await res.json();
        setError(data.error || "Invalid password");
      }
    } catch {
      setError("Failed to connect. Please try again.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="w-full max-w-xs">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="text-sm font-semibold text-slate-900">Admin</h1>
          <p className="mt-1 text-xs text-slate-400">Enter password to continue.</p>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="mt-4 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            autoFocus
          />

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            className="mt-3 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
          >
            Sign in
          </button>
        </div>
      </form>
    </div>
  );
}
