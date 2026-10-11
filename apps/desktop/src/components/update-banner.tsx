import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { platform } from "../lib/platform";
import { tr } from "../i18n/tr";
import { Button } from "./ui/button";

const SIX_HOURS = 6 * 60 * 60 * 1000;

/**
 * Kurulu masaüstü uygulamasında yeni sürüm varsa üstte bir şerit gösterir (ADR 0026). Açılışta ve altı saatte bir
 * kontrol eder; kontrol hatası (çevrimdışı, henüz yayın yok) sessizce yok sayılır. Tarayıcı kipinde hiç görünmez.
 */
export function UpdateBanner() {
  const [dismissed, setDismissed] = useState(false);
  const update = useQuery({
    queryKey: ["app-update"],
    enabled: platform.kind === "tauri",
    queryFn: () => platform.updates.check(),
    refetchInterval: SIX_HOURS,
    staleTime: SIX_HOURS,
    retry: false,
  });
  const install = useMutation({ mutationFn: () => platform.updates.install() });

  if (dismissed || !update.data) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-primary px-4 py-2 text-sm text-white" role="status">
      <Download className="size-4" />
      <span>{tr.updater.available(update.data.version)}</span>
      <Button size="sm" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10" disabled={install.isPending} onClick={() => install.mutate()}>
        {install.isPending && <Loader2 className="animate-spin" />}
        {install.isPending ? tr.updater.installing : tr.updater.install}
      </Button>
      {!install.isPending && (
        <button type="button" className="text-white/80 underline-offset-2 hover:underline" onClick={() => setDismissed(true)}>
          {tr.updater.later}
        </button>
      )}
      {install.isError && <span className="text-white">{tr.updater.error}</span>}
    </div>
  );
}
