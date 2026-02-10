"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { OrderRow } from "@/lib/db";

export default function AdminDashboard() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/orders");
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <span className="text-sm font-semibold text-slate-900">VoteMapper Admin</span>
          <div className="flex items-center gap-4">
            <Link href="/admin/outreach" className="text-xs text-slate-500 hover:text-slate-700 font-medium">
              Outreach
            </Link>
            <Link href="/admin/tool" className="text-xs text-slate-500 hover:text-slate-700 font-medium">
              Tool
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-lg font-semibold text-slate-900">Orders</h1>
        <p className="mt-1 text-xs text-slate-400">{orders.length} total</p>

        {loading ? (
          <p className="mt-8 text-sm text-slate-400">Loading...</p>
        ) : orders.length === 0 ? (
          <p className="mt-8 text-sm text-slate-400">No orders yet.</p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 pr-4 font-medium">Area</th>
                  <th className="pb-2 pr-4 font-medium">Tier</th>
                  <th className="pb-2 pr-4 font-medium">Amount</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Slug</th>
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-4 text-slate-500 tabular-nums font-mono">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-700">{order.customer_email}</td>
                    <td className="py-2.5 pr-4 text-slate-700">
                      {order.precinct ? `${order.precinct}, ` : ""}
                      {order.county}, {order.state}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {order.tier}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-700 tabular-nums font-mono">
                      ${(order.amount_cents / 100).toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-4">
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
                    </td>
                    <td className="py-2.5">
                      {order.slug && (
                        <Link
                          href={order.status === "fulfilled" ? `/c/${order.slug}` : `/admin/orders/${order.id}`}
                          className="font-mono text-blue-600 hover:underline"
                        >
                          /c/{order.slug}
                        </Link>
                      )}
                    </td>
                    <td className="py-2.5">
                      {order.status !== "fulfilled" && (
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          Fulfill
                        </Link>
                      )}
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
