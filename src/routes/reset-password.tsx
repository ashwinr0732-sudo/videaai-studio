import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — VideaAI" },
      {
        name: "description",
        content: "Create a new password for your VideaAI account.",
      },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw new Error(error.message);
      }

      toast.success("Password updated", {
        description: "Your password has been changed successfully.",
      });

      navigate({ to: "/login", replace: true });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not update your password.";

      setError(message);

      toast.error("Could not update password", {
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

        <h1 className="text-2xl font-semibold">
          Create a new password
        </h1>

        <p className="text-muted-foreground mt-1 text-sm">
          Choose a new password for your VideaAI account.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>

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

          <div className="space-y-2">
            <Label htmlFor="confirm-password">
              Confirm new password
            </Label>

            <Input
              id="confirm-password"
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
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

          <Button
            type="submit"
            className="w-full"
            disabled={busy}
          >
            {busy && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Update password
          </Button>
        </form>

        <p className="text-muted-foreground mt-6 text-center text-sm">
          <Link
            to="/login"
            className="text-primary hover:underline"
          >
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}