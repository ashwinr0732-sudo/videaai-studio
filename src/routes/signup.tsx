import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign up — VideaAI" },
      { name: "description", content: "Create a free VideaAI account and get 25 starter credits." },
      { property: "og:title", content: "Sign up — VideaAI" },
      { property: "og:description", content: "Start generating AI videos with 25 free credits." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { needsConfirmation } = await signUp(email, password, fullName);
      if (needsConfirmation) {
        setConfirmSent(true);
        toast.success("Check your email", {
          description: "Click the confirmation link to activate your account.",
        });
        return;
      }
      toast.success("Account created", { description: "25 starter credits added." });
      navigate({ to: "/app", replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create account.";
      setError(message);
      toast.error("Could not create account", { description: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center px-4 py-12">
      <div className="glow-top pointer-events-none absolute inset-x-0 top-0 h-96" />
      <div className="panel relative w-full max-w-md p-8">
        <Logo className="mb-8" />
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Start with 25 free generation credits.
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ada Lovelace"
              className="bg-surface-2"
            />
          </div>
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
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="bg-surface-2"
            />
          </div>
          {error && (
            <p
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
            >
              {error}
            </p>
          )}
          {confirmSent && (
            <p className="border-primary/40 bg-primary/10 text-primary rounded-lg border px-3 py-2 text-sm">
              Almost there — we sent a confirmation link to {email}. Click it to activate your
              account, then log in.
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create account
          </Button>
        </form>
        <p className="text-muted-foreground mt-6 text-center text-sm">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
