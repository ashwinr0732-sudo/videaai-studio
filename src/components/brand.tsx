import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn("flex items-center gap-2", className)}>
      <span className="bg-brand grid h-8 w-8 place-items-center rounded-lg">
        <span className="bg-background/85 h-3 w-3 rounded-[3px]" />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight">VideaAI</span>
    </Link>
  );
}
