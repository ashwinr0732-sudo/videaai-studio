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
      { title: "Log in — VideaAI" },
      { name: "description", content: "Log in to your VideaAI workspace to create AI videos." },
      { property: "og:title", content: "Log in — VideaAI" },
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate({ to: "/app", replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not sign in.";
      setError(message);
      toast.error("Could not sign in", { description: message });
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
        <p className="text-muted-foreground mt-1 text-sm">Log in to continue creating.</p>
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
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-surface-2"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Log in
          </Button>
        </form>
        <p className="text-muted-foreground mt-6 text-center text-sm">
          New to VideaAI?{" "}
          <Link to="/signup" className="text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
