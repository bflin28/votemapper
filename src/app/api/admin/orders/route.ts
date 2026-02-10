import { NextRequest, NextResponse } from "next/server";
import { getOrderById, getAllOrders } from "@/lib/db";

export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("id");

  if (orderId) {
    const order = getOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json(order);
  }

  const orders = getAllOrders();
  return NextResponse.json(orders);
}
