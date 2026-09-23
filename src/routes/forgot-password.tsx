import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot Password — VideaAI" },
      {
        name: "description",
        content: "Reset your VideaAI account password.",
      },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    setBusy(true);
    setError(null);

    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : "";

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) {
        throw new Error(error.message);
      }

      setSent(true);

      toast.success("Password reset email sent", {
        description: "Check your inbox for the password reset link.",
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not send the password reset email.";

      setError(message);

      toast.error("Could not reset password", {
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

        {!sent ? (
          <>
            <h1 className="text-2xl font-semibold">
              Forgot your password?
            </h1>

            <p className="text-muted-foreground mt-1 text-sm">
              Enter your email and we'll send you a link to reset your
              password.
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
                Send reset link
              </Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">
              Check your email
            </h1>

            <p className="text-muted-foreground mt-2 text-sm">
              If an account exists for{" "}
              <span className="text-foreground font-medium">
                {email}
              </span>
              , we've sent a password reset link.
            </p>

            <p className="text-muted-foreground mt-4 text-sm">
              Check your inbox and spam folder. The link will take you
              back to VideaAI where you can choose a new password.
            </p>
          </>
        )}

        <p className="text-muted-foreground mt-6 text-center text-sm">
          Remember your password?{" "}
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