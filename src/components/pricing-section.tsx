import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export function PricingSection({
  onSelect,
  ctaLabel = "Get started",
}: {
  onSelect?: (planId: string) => void;
  ctaLabel?: string;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {PLANS.map((plan) => (
        <div
          key={plan.id}
          className={cn(
            "panel relative flex flex-col p-6",
            plan.highlighted && "border-primary/50 shadow-[var(--shadow-elevated)]",
          )}
        >
          {plan.highlighted && (
            <span className="bg-brand text-primary-foreground absolute -top-3 left-6 rounded-full px-3 py-1 text-xs font-semibold">
              Most popular
            </span>
          )}
          <h3 className="text-lg font-semibold">{plan.name}</h3>
          <p className="text-muted-foreground mt-1 text-sm">{plan.tagline}</p>
          <div className="mt-5 flex items-baseline gap-1">
            <span className="font-display text-4xl font-semibold">${plan.price}</span>
            <span className="text-muted-foreground text-sm">/month</span>
          </div>
          <p className="text-primary mt-1 text-sm">{plan.credits} credits</p>
          <ul className="mt-6 flex-1 space-y-3 text-sm">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                <span className="text-muted-foreground">{f}</span>
              </li>
            ))}
          </ul>
          <Button
            className="mt-6"
            variant={plan.highlighted ? "default" : "secondary"}
            onClick={() => onSelect?.(plan.id)}
          >
            {ctaLabel}
          </Button>
        </div>
      ))}
    </div>
  );
}
