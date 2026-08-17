import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/app")({
  // Session lives in the browser today; when a real backend is connected this
  // subtree moves under an `_authenticated` layout with a server-side gate.
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="text-muted-foreground grid min-h-screen place-items-center text-sm">
        Loading workspace…
      </div>
    );
  }

  return <Outlet />;
}
