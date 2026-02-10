import { NextRequest, NextResponse } from "next/server";
import { updateOutreachLogStatusByResendId } from "@/lib/db";

// Resend webhook events
interface ResendWebhookEvent {
  type: string;
  data: {
    email_id: string;
    [key: string]: unknown;
  };
}

const EVENT_TO_STATUS: Record<string, string> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.opened": "opened",
  "email.clicked": "opened",
  "email.complained": "bounced",
};

export async function POST(request: NextRequest) {
  try {
    const event: ResendWebhookEvent = await request.json();

    const newStatus = EVENT_TO_STATUS[event.type];
    if (!newStatus) {
      // Event type we don't track — acknowledge
      return NextResponse.json({ received: true });
    }

    const resendId = event.data.email_id;
    if (!resendId) {
      return NextResponse.json({ received: true });
    }

    updateOutreachLogStatusByResendId(resendId, newStatus);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Resend webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
