import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../lib/auth-store";
import { useWorkspaceMembership } from "../lib/use-workspace-membership";
import { tr } from "../i18n/tr";

const PUBLIC_PATHS = ["/login", "/reset-password"];

export function RouteGuard() {
  const location = useLocation();
  const init = useAuthStore((state) => state.init);
  const session = useAuthStore((state) => state.session);
  const initialized = useAuthStore((state) => state.initialized);

  useEffect(() => {
    init();
  }, [init]);

  const isPublicPath = PUBLIC_PATHS.includes(location.pathname);

  const membershipQuery = useWorkspaceMembership();

  if (!initialized) {
    return <FullScreenMessage text={tr.auth.loadingSession} />;
  }

  if (!session) {
    if (isPublicPath) return <Outlet />;
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (isPublicPath) {
    return <Navigate to="/" replace />;
  }

  if (membershipQuery.isPending) {
    return <FullScreenMessage text={tr.auth.loadingSession} />;
  }

  if (!membershipQuery.data && location.pathname !== "/invite-pending") {
    return <Navigate to="/invite-pending" replace />;
  }

  if (membershipQuery.data && location.pathname === "/invite-pending") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function FullScreenMessage({ text }: { text: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-bg text-sm text-muted">
      {text}
    </div>
  );
}
