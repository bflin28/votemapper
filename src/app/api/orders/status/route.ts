import { NextRequest, NextResponse } from "next/server";
import { getOrderStatus } from "@/lib/db";

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("id");

  if (!orderId) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  const data = getOrderStatus(orderId);

  if (!data) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ status: data.status, slug: data.slug });
}
