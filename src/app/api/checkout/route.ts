import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { spawn } from "child_process";
import { insertOrder } from "@/lib/db";

function calculateAmountCents(counties: string[], precincts: string[]) {
  return (29 + counties.length * 10 + precincts.length * 5) * 100;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, state, counties, precincts } = body;

    if (!email || !state || !Array.isArray(counties) || counties.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const slug = nanoid(8);
    const password = nanoid(12);
    const amountCents = calculateAmountCents(counties, precincts || []);

    const orderId = insertOrder({
      customer_email: email,
      state,
      county: counties.join(", "),
      precinct: precincts?.length ? precincts.join(", ") : null,
      tier: "custom",
      amount_cents: amountCents,
      status: "paid",
      slug,
      password,
      stripe_session_id: null,
    });

    console.log(`Order created: id=${orderId}, slug=${slug}`);

    // Spawn the scrape-and-process script (fire-and-forget, inherits terminal stdio)
    // Build path at runtime to avoid Turbopack static analysis
    const scriptPath = [process.cwd(), "scripts", "scrape-order.mjs"].join("/");
    const child = spawn("node", [scriptPath, "--orderId", orderId], {
      stdio: "inherit",
      detached: true,
      env: { ...process.env },
    });
    child.unref();
    console.log(`Spawned scrape-order.mjs for order ${orderId} (pid: ${child.pid})`);

    return NextResponse.json({ slug, password, orderId });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }
}
