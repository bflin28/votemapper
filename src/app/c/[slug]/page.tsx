import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getCampaignBySlug, CampaignRow } from "@/lib/db";
import CampaignView from "./CampaignView";
import PasswordGate from "./PasswordGate";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function CampaignPage({ params }: Props) {
  const { slug } = await params;

  const campaign = getCampaignBySlug(slug) as CampaignRow | undefined;

  if (!campaign) {
    notFound();
  }

  // Password gate check
  if (campaign.password) {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(`campaign_${slug}`)?.value;
    if (cookieValue !== campaign.password) {
      return <PasswordGate slug={slug} />;
    }
  }

  return <CampaignView campaign={campaign} />;
}
