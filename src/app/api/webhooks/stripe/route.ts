import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getOrderByStripeSessionId, insertOrder } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const meta = session.metadata || {};

    // Check if order already exists (Stripe retries webhooks)
    const existing = getOrderByStripeSessionId(session.id);
    if (existing) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    try {
      insertOrder({
        stripe_session_id: session.id,
        customer_email: session.customer_email || meta.email || "unknown",
        customer_name: session.customer_details?.name || null,
        state: meta.state || "",
        county: meta.county || "",
        precinct: meta.precinct || null,
        tier: meta.tier || "precinct",
        amount_cents: session.amount_total || 0,
        status: "paid",
      });
    } catch (err: unknown) {
      // Unique constraint violation is also a duplicate — return 200
      if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
        return NextResponse.json({ received: true, duplicate: true });
      }
      console.error("Failed to insert order:", err);
      return NextResponse.json(
        { error: "Database error" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true });
}
