import type * as React from "react";
import { tr } from "../../i18n/tr";
import { AppLogo } from "../../components/domain/app-logo";

/** Giriş/sıfırlama/davet ekranlarının ortak çerçevesi. */
export function AuthShell({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(600px circle at 15% 20%, rgb(47 107 255 / 0.18), transparent 60%), radial-gradient(500px circle at 85% 80%, rgb(139 92 246 / 0.16), transparent 60%)",
        }}
        aria-hidden
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <AppLogo />
          <span className="text-base font-semibold text-text">{tr.app.name}</span>
        </div>
        <div className="rounded-2xl border border-border bg-surface/90 p-6 shadow-2xl shadow-black/40 backdrop-blur">
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
  return <p className="mt-1 text-xs text-[#f87171]">{message}</p>;
}
