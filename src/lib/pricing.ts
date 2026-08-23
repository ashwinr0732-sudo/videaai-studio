export interface Plan {
  id: string;
  name: string;
  price: number;
  credits: number;
  tagline: string;
  features: string[];
  highlighted?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 0,
    credits: 25,
    tagline: "Explore what VideaAI can do.",
    features: ["25 credits on signup", "Up to 15s multi-scene videos", "720p exports", "Community support"],
  },
  {
    id: "creator",
    name: "Creator",
    price: 29,
    credits: 400,
    tagline: "For makers shipping content weekly.",
    features: [
      "400 credits / month",
      "Up to 30s multi-scene videos",
      "1080p exports",
      "All styles unlocked",
      "Priority queue",
    ],
    highlighted: true,
  },
  {
    id: "studio",
    name: "Studio",
    price: 99,
    credits: 1600,
    tagline: "Scale production across a team.",
    features: [
      "1600 credits / month",
      "4K exports",
      "Team workspace",
      "API access",
      "Dedicated support",
    ],
  },
];
