import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { tr } from "../i18n/tr";
import { Button } from "../components/ui/button";

/** Rota içinde yakalanmayan hatalarda React Router'ın geliştirici ekranı yerine gösterilir. */
export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-bg p-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-danger/15 text-danger">
        <AlertTriangle className="size-5" />
      </span>
      <h1 className="text-lg font-semibold text-text">{tr.errorBoundary.title}</h1>
      <p className="max-w-md text-sm break-words text-muted">{message}</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => navigate("/")}>
          {tr.nav.dashboard}
        </Button>
        <Button onClick={() => window.location.reload()}>{tr.errorBoundary.reload}</Button>
      </div>
    </div>
  );
}
