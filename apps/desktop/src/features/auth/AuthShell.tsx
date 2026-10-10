import type * as React from "react";
import { tr } from "../../i18n/tr";
import { AppLogo } from "../../components/domain/app-logo";

/** Giriş/sıfırlama/davet ekranlarının ortak çerçevesi. */
export function AuthShell({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg p-6">
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <AppLogo />
          <span className="text-base font-semibold text-text">{tr.app.name}</span>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6 shadow-pop">
          <div className="mb-5 space-y-1 text-center">
            <h1 className="text-lg font-semibold text-text">{title}</h1>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-danger">{message}</p>;
}
