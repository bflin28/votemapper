import { NextRequest, NextResponse } from "next/server";
import {
  getCandidates,
  getCandidateById,
  insertOutreachLog,
  updateCandidateStatusIfNew,
} from "@/lib/db";
import { getResendClient } from "@/lib/resend";

// GET: List candidates with optional filters
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const county = searchParams.get("county") || undefined;
  const status = searchParams.get("status") || undefined;

  const data = getCandidates({ county, status });
  return NextResponse.json(data);
}

// POST: Send outreach email to a candidate
export async function POST(request: NextRequest) {
  const { candidateId, demoSlug } = await request.json();

  if (!candidateId) {
    return NextResponse.json({ error: "Missing candidateId" }, { status: 400 });
  }

  // Fetch candidate
  const candidate = getCandidateById(candidateId);

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  if (!candidate.email) {
    return NextResponse.json({ error: "Candidate has no email address" }, { status: 400 });
  }

  const resend = getResendClient();
  const demoUrl = demoSlug
    ? `${process.env.NEXT_PUBLIC_SITE_URL || "https://votemapper.com"}/c/${demoSlug}`
    : null;

  const subject = `Walk routes for ${candidate.county || candidate.state} — VoteMapper`;
  const htmlBody = buildOutreachEmail(candidate, demoUrl);

  try {
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "VoteMapper <outreach@votemapper.com>",
      to: candidate.email,
      subject,
      html: htmlBody,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    // Log the outreach
    insertOutreachLog({
      candidate_id: candidateId,
      subject,
      resend_id: emailData?.id || null,
      status: "sent",
    });

    // Update candidate status
    updateCandidateStatusIfNew(candidateId, "emailed");

    return NextResponse.json({ ok: true, resendId: emailData?.id });
  } catch (error) {
    console.error("Outreach error:", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}

function buildOutreachEmail(
  candidate: { name: string; office: string; county?: string | null; state: string },
  demoUrl: string | null
): string {
  const firstName = candidate.name.split(" ")[0];
  const area = candidate.county
    ? `${candidate.county} County, ${candidate.state}`
    : candidate.state;

  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
  <p>Hi ${firstName},</p>

  <p>I saw you're running for <strong>${candidate.office}</strong> in ${area} — congrats on filing!</p>

  <p>I built a tool that creates optimized door-knocking routes from voter files. It clusters voters by geography, scores them by engagement, and generates walk routes your volunteers can follow on their phones.</p>

  ${
    demoUrl
      ? `<p><strong>Here's a live demo for ${area}:</strong><br><a href="${demoUrl}" style="color: #2563eb;">${demoUrl}</a></p>`
      : ""
  }

  <p>It's a one-time purchase starting at $29 for a single precinct. Happy to answer any questions.</p>

  <p>Best,<br>Ben<br><span style="color: #94a3b8; font-size: 13px;">VoteMapper</span></p>
</div>
`.trim();
}
