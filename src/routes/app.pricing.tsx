import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard-shell";
import { PricingSection } from "@/components/pricing-section";

export const Route = createFileRoute("/app/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — VideaAI" },
      { name: "description", content: "Choose a VideaAI plan and top up your generation credits." },
      { property: "og:title", content: "Pricing — VideaAI" },
      { property: "og:description", content: "VideaAI plans and credit packs." },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <DashboardShell title="Pricing" description="Upgrade whenever you need more credits.">
      <PricingSection
        ctaLabel="Choose plan"
        onSelect={() =>
          toast("Checkout coming soon", {
            description: "Billing will be handled server-side once payments are connected.",
          })
        }
      />
    </DashboardShell>
  );
}
