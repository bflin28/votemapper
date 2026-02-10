"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useState, useCallback } from "react";

type OrderStatus = "paid" | "scraping" | "processing" | "fulfilled" | "scrape_failed" | "process_failed" | "error" | string;

const STATUS_CONFIG: Record<string, { label: string; color: string; description: string }> = {
  paid: {
    label: "Queued",
    color: "bg-slate-100 text-slate-600",
    description: "Your order is queued for processing.",
  },
  scraping: {
    label: "Scraping voter data",
    color: "bg-blue-100 text-blue-700",
    description: "Pulling voter records from public data sources...",
  },
  processing: {
    label: "Processing",
    color: "bg-amber-100 text-amber-700",
    description: "Geocoding addresses and optimizing walk routes...",
  },
  fulfilled: {
    label: "Ready",
    color: "bg-green-100 text-green-700",
    description: "Your campaign is ready! Click below to view your routes.",
  },
  scrape_failed: {
    label: "Scrape failed",
    color: "bg-red-100 text-red-700",
    description: "Something went wrong pulling voter data. We'll retry shortly.",
  },
  process_failed: {
    label: "Processing failed",
    color: "bg-red-100 text-red-700",
    description: "Route processing failed. We'll investigate and retry.",
  },
  error: {
    label: "Error",
    color: "bg-red-100 text-red-700",
    description: "An unexpected error occurred. We'll look into it.",
  },
};

function SuccessContent() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug");
  const password = searchParams.get("password");
  const orderId = searchParams.get("orderId");

  const [status, setStatus] = useState<OrderStatus>("paid");
  const [polling, setPolling] = useState(!!orderId);

  const pollStatus = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await fetch(`/api/orders/status?id=${orderId}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        if (data.status === "fulfilled" || data.status?.includes("failed") || data.status === "error") {
          setPolling(false);
        }
      }
    } catch {
      // Network error — keep polling
    }
  }, [orderId]);

  useEffect(() => {
    if (!polling) return;
    pollStatus(); // immediate first check
    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, [polling, pollStatus]);

  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.error;
  const isReady = status === "fulfilled";
  const isActive = status === "scraping" || status === "processing";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">
          Order placed
        </h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          We&apos;re preparing your voter data and walk routes.
        </p>

        {/* Status badge */}
        {orderId && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${cfg.color}`}>
              {isActive && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
                </span>
              )}
              {cfg.label}
            </span>
          </div>
        )}
        {orderId && (
          <p className="mt-2 text-xs text-slate-400">{cfg.description}</p>
        )}

        {/* Campaign link when ready */}
        {isReady && slug && (
          <Link
            href={`/c/${slug}`}
            className="mt-4 inline-flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            View your campaign &rarr;
          </Link>
        )}

        {slug && password && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left">
            <h2 className="text-xs font-semibold text-amber-800">Save these credentials</h2>
            <p className="mt-1 text-[11px] text-amber-600">
              You&apos;ll need them to access your campaign once it&apos;s ready.
            </p>
            <div className="mt-3 space-y-2">
              <div>
                <span className="text-[10px] font-medium text-amber-700 uppercase tracking-wide">Campaign URL</span>
                <p className="mt-0.5 rounded-md bg-white border border-amber-200 px-3 py-1.5 text-sm font-mono text-slate-900">
                  /c/{slug}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-medium text-amber-700 uppercase tracking-wide">Password</span>
                <p className="mt-0.5 rounded-md bg-white border border-amber-200 px-3 py-1.5 text-sm font-mono text-slate-900">
                  {password}
                </p>
              </div>
            </div>
          </div>
        )}

        {!orderId && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-left">
            <h2 className="text-xs font-semibold text-slate-700">What happens next?</h2>
            <ol className="mt-2 space-y-1.5 text-xs text-slate-500">
              <li className="flex gap-2">
                <span className="shrink-0 text-slate-300">1.</span>
                We pull the voter data for your area
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-slate-300">2.</span>
                Addresses are geocoded and mapped
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-slate-300">3.</span>
                Routes are optimized for efficient door-knocking
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-slate-300">4.</span>
                Visit your campaign URL and enter your password to view
              </li>
            </ol>
          </div>
        )}

        <Link
          href="/"
          className="mt-6 inline-block text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          &larr; Back to VoteMapper
        </Link>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
