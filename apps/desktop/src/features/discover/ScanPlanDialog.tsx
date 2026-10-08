import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import { OUTREACH_LANGUAGES, getCountryProfile, type OutreachLanguage } from "@lbf/core";
import { tr } from "../../i18n/tr";
import { DISCOVER_CATEGORIES, cityBoundsQuery, scanCategories } from "../../lib/discover-markets";
import { fetchCityBounds, type CityBounds } from "../../lib/places-provider";
import { supabase } from "../../lib/supabase-client";
import { usePlacesUsage } from "../../lib/use-jobs";
import { kickScan } from "../../workers/scan-runner";
import { Button } from "../../components/ui/button";
import { Label, Select } from "../../components/ui/input";
import { Dialog, DialogContent } from "../../components/ui/primitives";

interface ScanPlanDialogProps {
  workspaceId: string;
  countryCode: string;
  city: string;
  onClose: () => void;
  onStarted: () => void;
}

/**
 * Şehir taraması başlatır (ADR 0014). İki adım: önce şehrin sınırı Places'tan bulunur ve kullanıcıya gösterilir
 * (yanlış yer taranmasın), sonra plan oluşturulur. Mesaj dilinin varsayılanı yoktur (ADR 0013).
 */
export function ScanPlanDialog({ workspaceId, countryCode, city, onClose, onStarted }: ScanPlanDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const usage = usePlacesUsage().data;
  const [selected, setSelected] = useState<string[]>([]);
  const [language, setLanguage] = useState<OutreachLanguage | "">("");
  const [found, setFound] = useState<CityBounds | null>(null);

  const market = { regionCode: countryCode, languageCode: getCountryProfile(countryCode).defaultLanguage ?? "en" };
  const categories = scanCategories(selected, countryCode);
  const capMissing = usage !== undefined && usage.cap === null;
  const remaining = usage && usage.cap !== null ? Math.max(usage.cap - usage.used, 0) : null;

  const findCity = useMutation({
    mutationFn: () => fetchCityBounds(workspaceId, cityBoundsQuery(city, countryCode), market),
    onSuccess: (result) => {
      setFound(result);
      void queryClient.invalidateQueries({ queryKey: ["places-usage", workspaceId] });
    },
  });

  const start = useMutation({
    mutationFn: async () => {
      if (!found || !language) throw new Error(tr.scanPlan.startError);
      const { error } = await supabase.rpc("create_scan_plan", {
        ws: workspaceId,
        p_country: countryCode,
        p_city: city.trim(),
        p_bounds: found.bounds,
        p_categories: categories,
        p_language: language,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["scan-plans", workspaceId] });
      void kickScan(workspaceId);
      onStarted();
    },
  });

  const toggle = (label: string) =>
    setSelected((prev) => (prev.includes(label) ? prev.filter((value) => value !== label) : [...prev, label]));
  const ready = categories.length > 0 && language !== "" && city.trim() !== "" && !capMissing;
  const error = findCity.error ?? start.error;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={tr.scanPlan.title} description={tr.scanPlan.description} size="lg">
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-text">
            <MapPin className="size-4 text-primary" />
            <span className="text-muted">{tr.scanPlan.cityLabel}:</span>
            {city.trim() || "—"} · {getCountryProfile(countryCode).nameTr}
          </p>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="mb-0">{tr.scanPlan.categoriesLabel}</Label>
              <span className="flex gap-3 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setSelected(DISCOVER_CATEGORIES.map((c) => c.tr))}>
                  {tr.scanPlan.selectAll}
                </button>
                <button type="button" className="text-muted hover:underline" onClick={() => setSelected([])}>
                  {tr.scanPlan.clearAll}
                </button>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
              {DISCOVER_CATEGORIES.map((c) => (
                <label key={c.tr} className="flex cursor-pointer items-center gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-primary)]"
                    checked={selected.includes(c.tr)}
                    onChange={() => toggle(c.tr)}
                  />
                  {c.tr}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>{tr.scanPlan.languageLabel}</Label>
            <Select value={language} onChange={(e) => setLanguage(e.target.value as OutreachLanguage | "")}>
              <option value="">{tr.scanPlan.languagePlaceholder}</option>
              {OUTREACH_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {tr.scanPlan.languages[code]}
                </option>
              ))}
            </Select>
          </div>

          {capMissing && (
            <div className="space-y-2 rounded-lg bg-warning/10 p-3 text-sm text-[#fbbf24]">
              <p>{tr.scanPlan.capMissing}</p>
              <Button size="sm" variant="outline" onClick={() => navigate("/settings?section=scoring")}>
                {tr.scanPlan.openSettings}
              </Button>
            </div>
          )}

          {found && (
            <div className="space-y-1 rounded-lg bg-surface-2 p-3 text-sm">
              <p className="text-text">
                <span className="text-muted">{tr.scanPlan.cityFound}:</span> {found.label}
              </p>
              <p className="text-xs text-muted">{tr.scanPlan.estimate(categories.length, remaining)}</p>
            </div>
          )}
          {findCity.isSuccess && !found && <p className="text-sm text-[#f87171]">{tr.scanPlan.cityNotFound}</p>}
          {error && <p className="text-sm text-[#f87171]">{error.message || tr.scanPlan.startError}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {tr.common.cancel}
            </Button>
            {found ? (
              <Button disabled={!ready || start.isPending} onClick={() => start.mutate()}>
                {start.isPending && <Loader2 className="animate-spin" />}
                {start.isPending ? tr.scanPlan.starting : tr.scanPlan.start}
              </Button>
            ) : (
              <Button disabled={!ready || findCity.isPending} onClick={() => findCity.mutate()}>
                {findCity.isPending && <Loader2 className="animate-spin" />}
                {findCity.isPending ? tr.scanPlan.findingCity : tr.scanPlan.findCity}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
