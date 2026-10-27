import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in â€” VideaAI" },
      {
        name: "description",
        content: "Log in to your VideaAI workspace to create AI videos.",
      },
      { property: "og:title", content: "Log in â€” VideaAI" },
      { property: "og:description", content: "Access your VideaAI workspace." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!termsAccepted) {
      setError("You must agree to the Terms & Conditions before logging in.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await signIn(email, password);
      navigate({ to: "/app", replace: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not sign in.";

      setError(message);

      toast.error("Could not sign in", {
        description: message,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center px-4 py-12">
      <div className="glow-top pointer-events-none absolute inset-x-0 top-0 h-96" />

      <div className="panel relative w-full max-w-md p-8">
        <Logo className="mb-8" />

        <h1 className="text-2xl font-semibold">Welcome back</h1>

        <p className="text-muted-foreground mt-1 text-sm">
          Log in to continue creating.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>

            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@studio.com"
              className="bg-surface-2"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>

              <Link
                to="/forgot-password"
                className="text-primary text-sm hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 character"
              className="bg-surface-2"
            />
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="relative mt-1 h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-md border border-border bg-surface-2 transition-all checked:border-primary checked:bg-primary checked:after:absolute checked:after:left-1/2 checked:after:top-1/2 checked:after:block checked:after:h-2 checked:after:w-1 checked:after:-translate-x-1/2 checked:after:-translate-y-1/2 checked:after:rotate-45 checked:after:border-b-2 checked:after:border-r-2 checked:after:border-[#07191a]"
            />

            <span className="text-muted-foreground leading-5">
              I have read and agree to the{" "}
              <Link
                to="/terms"
                className="text-primary hover:underline"
              >
                Terms & Conditions
              </Link>
              .
            </span>
          </label>

          {error && (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={busy || !termsAccepted}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Log in
          </Button>
        </form>

        <p className="text-muted-foreground mt-6 text-center text-sm">
          New to VideaAI?{" "}
          <Link
            to="/signup"
            className="text-primary hover:underline"
          >
            Create an account
          </Link>
        </p>

        <p className="text-muted-foreground mt-4 text-center text-xs">
          By using VideaAI, you acknowledge that AI-generated content may be
          unpredictable and that you are responsible for your use of the
          platform and generated content.
        </p>
      </div>
    </div>
  );
}




