export interface Tier {
  id: string;
  name: string;
  price: number;
  amountCents: number;
  description: string;
  features: string[];
  popular?: boolean;
}

export const TIERS: Tier[] = [
  {
    id: "precinct",
    name: "Precinct",
    price: 29,
    amountCents: 2900,
    description: "Single precinct walk routes",
    features: [
      "Optimized door-knocking routes",
      "Interactive map with filters",
      "Shareable link for volunteers",
      "Voter engagement scoring",
    ],
  },
  {
    id: "city",
    name: "City Council",
    price: 49,
    amountCents: 4900,
    description: "Full city council district",
    features: [
      "Everything in Precinct",
      "Multiple walker routes",
      "Voter history analysis",
      "CSV export for walk lists",
    ],
    popular: true,
  },
  {
    id: "county",
    name: "County-Wide",
    price: 79,
    amountCents: 7900,
    description: "Complete county coverage",
    features: [
      "Everything in City Council",
      "County-wide optimization",
      "Precinct-level breakdowns",
      "Priority fulfillment",
    ],
  },
];

export function getTierById(id: string): Tier | undefined {
  return TIERS.find((t) => t.id === id);
}
