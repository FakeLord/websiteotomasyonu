import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { tr } from "../i18n/tr";

function subscribe(callback: () => void): () => void {
  return onlineManager.subscribe(callback);
}

function getSnapshot(): boolean {
  return onlineManager.isOnline();
}

/**
 * navigator.onLine + TanStack Query'nin onlineManager'ı ile senkron çalışan
 * çevrimdışı banner iskeleti (PHASE-00 → Desktop kabuğu).
 */
export function OnlineBanner() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (isOnline) {
    return null;
  }

  return (
    <div className="flex items-center justify-center bg-amber-100 px-4 py-2 text-sm text-amber-900">
      <span>{tr.status.offline}</span>
    </div>
  );
}
