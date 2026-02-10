"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { OrderRow } from "@/lib/db";

export default function OrderDetail() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [voterFile, setVoterFile] = useState<File | null>(null);
  const [historyFile, setHistoryFile] = useState<File | null>(null);

  // Process state
  const [processing, setProcessing] = useState(false);
  const [processLog, setProcessLog] = useState<string[]>([]);
  const [slug, setSlug] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    const res = await fetch(`/api/admin/orders?id=${orderId}`);
    if (res.ok) {
      const data = await res.json();
      setOrder(data as OrderRow);
      if (data?.slug) setSlug(data.slug);
    } else {
      setOrder(null);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  async function handleProcess() {
    if (!voterFile) return;

    setProcessing(true);
    setProcessLog(["Uploading files..."]);

    try {
      // Upload voter CSV
      const formData = new FormData();
      formData.append("voterFile", voterFile);
      if (historyFile) formData.append("historyFile", historyFile);
      formData.append("orderId", orderId);

      const uploadRes = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || "Upload failed");
      }

      const uploadData = await uploadRes.json();
      setProcessLog((prev) => [
        ...prev,
        `Uploaded: ${uploadData.voterCount} voters`,
      ]);

      // Process: geocode + optimize
      setProcessLog((prev) => [...prev, "Processing (geocode + optimize)..."]);

      const processRes = await fetch("/api/admin/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          voterCsv: uploadData.voterCsv,
          historyCsv: uploadData.historyCsv || null,
        }),
      });

      if (!processRes.ok) {
        const err = await processRes.json();
        throw new Error(err.error || "Processing failed");
      }

      const result = await processRes.json();
      setSlug(result.slug);
      setProcessLog((prev) => [
        ...prev,
        `Done! ${result.geocodedCount} geocoded, ${result.routeCount} routes`,
        `Published at /c/${result.slug}`,
      ]);

      // Refresh order
      loadOrder();
    } catch (err) {
      setProcessLog((prev) => [
        ...prev,
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      ]);
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-400">Order not found.</p>
      </div>
    );
  }

  const areaLabel = order.precinct
    ? `${order.precinct}, ${order.county}, ${order.state}`
    : `${order.county}, ${order.state}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-3">
          <Link href="/admin" className="text-xs text-slate-400 hover:text-slate-600">
            &larr; Orders
          </Link>
          <span className="text-xs text-slate-300">/</span>
          <span className="text-sm font-semibold text-slate-900">Order Detail</span>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Order info */}
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{order.customer_email}</h2>
              <p className="mt-0.5 text-xs text-slate-400">{areaLabel}</p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                order.status === "fulfilled"
                  ? "bg-green-50 text-green-700"
                  : order.status === "processing"
                    ? "bg-blue-50 text-blue-700"
                    : "bg-amber-50 text-amber-700"
              }`}
            >
              {order.status}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-slate-400">Tier</span>
              <p className="mt-0.5 font-medium text-slate-700">{order.tier}</p>
            </div>
            <div>
              <span className="text-slate-400">Amount</span>
              <p className="mt-0.5 font-medium text-slate-700 font-mono tabular-nums">
                ${(order.amount_cents / 100).toFixed(2)}
              </p>
            </div>
            <div>
              <span className="text-slate-400">Date</span>
              <p className="mt-0.5 font-medium text-slate-700 font-mono tabular-nums">
                {new Date(order.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {order.password && (
            <div className="mt-4 text-xs">
              <span className="text-slate-400">Password</span>
              <p className="mt-0.5 font-medium text-slate-700 font-mono">{order.password}</p>
            </div>
          )}

          {order.slug && order.status !== "fulfilled" && (
            <div className="mt-2 text-xs">
              <span className="text-slate-400">Pre-assigned Slug</span>
              <p className="mt-0.5 font-medium text-slate-700 font-mono">{order.slug}</p>
            </div>
          )}
        </div>

        {/* Fulfillment */}
        {slug ? (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-5">
            <h3 className="text-sm font-semibold text-green-900">Fulfilled</h3>
            <p className="mt-1 text-xs text-green-700">
              Campaign published at{" "}
              <Link href={`/c/${slug}`} className="font-mono underline">
                /c/{slug}
              </Link>
            </p>
          </div>
        ) : (
          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-900">Fulfill Order</h3>
            <p className="mt-1 text-xs text-slate-400">
              Upload voter CSV (and optional history CSV), then process.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Voter CSV
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setVoterFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  History CSV <span className="text-slate-300">(optional)</span>
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setHistoryFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                />
              </div>

              <button
                onClick={handleProcess}
                disabled={!voterFile || processing}
                className="rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? "Processing..." : "Process & Publish"}
              </button>
            </div>

            {/* Process log */}
            {processLog.length > 0 && (
              <div className="mt-4 rounded-md bg-slate-50 border border-slate-100 p-3">
                {processLog.map((line, i) => (
                  <p key={i} className="text-[11px] font-mono text-slate-600">
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
