import { useState } from "react";
import Papa from "papaparse";
import { useQueryClient } from "@tanstack/react-query";
import {
  classifyMatch,
  normalizeDomain,
  normalizePhone,
  normalizeSocial,
  SUPPORTED_COUNTRY_CODES,
  countryFlag,
  getCountryProfile,
  type DedupeCandidate,
} from "@lbf/core";
import { geoDefaultsForCountry, resolveRowCountry } from "../../lib/business-geo";
import { useUiStore } from "../../lib/ui-store";
import { supabase } from "../../lib/supabase-client";
import { recomputeScore } from "../../workers/score-runner";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent } from "../../components/ui/primitives";
import { Badge } from "../../components/ui/badge";
import { Select } from "../../components/ui/input";
import { Table, Td, Th } from "../../components/ui/data-display";

interface ImportCsvDialogProps {
  workspaceId: string;
  onClose: () => void;
}

interface CsvRow {
  name?: string;
  country?: string;
  category?: string;
  city?: string;
  district?: string;
  phone?: string;
  email?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
}

interface PreviewRow {
  raw: CsvRow;
  payload: Record<string, unknown>;
  status: "CREATED" | "POSSIBLE_DUPLICATE" | "DUPLICATE_MERGED";
}

export function ImportCsvDialog({ workspaceId, onClose }: ImportCsvDialogProps) {
  const queryClient = useQueryClient();
  const marketCountry = useUiStore((state) => state.market.country);
  const [defaultCountry, setDefaultCountry] = useState(marketCountry || "US");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = Papa.parse<CsvRow>(text, { header: true, skipEmptyLines: true });

    const { data: existingRaw } = await supabase
      .from("businesses")
      .select("id, google_place_id, website_domain, primary_phone_e164, normalized_name, district, country_code")
      .eq("workspace_id", workspaceId)
      .is("merged_into", null);

    const existing: DedupeCandidate[] = (existingRaw ?? []).map((b) => ({
      id: b.id as string,
      googlePlaceId: b.google_place_id as string | null,
      websiteDomain: b.website_domain as string | null,
      phoneE164: b.primary_phone_e164 as string | null,
      normalizedName: b.normalized_name as string,
      district: b.district as string | null,
      countryCode: b.country_code as string | null,
    }));

    const seenInFile: DedupeCandidate[] = [];
    const preview: PreviewRow[] = [];

    for (const raw of parsed.data) {
      const name = raw.name?.trim();
      if (!name) continue;

      const countryCode = resolveRowCountry(raw.country, defaultCountry);
      const phone = raw.phone ? normalizePhone(raw.phone, countryCode)?.e164 ?? undefined : undefined;
      const instagram = raw.instagram ? (normalizeSocial(raw.instagram, "INSTAGRAM") ?? undefined) : undefined;
      const facebook = raw.facebook ? (normalizeSocial(raw.facebook, "FACEBOOK") ?? undefined) : undefined;
      const websiteDomain = raw.website ? normalizeDomain(raw.website) || undefined : undefined;
      const normalizedName = name.toLowerCase();
      const district = raw.district?.trim();

      const match = classifyMatch(
        { websiteDomain, phoneE164: phone, instagram, facebook, normalizedName, district, countryCode },
        [...existing, ...seenInFile],
      );

      const payload = {
        name,
        category: raw.category?.trim() || undefined,
        city: raw.city?.trim() || undefined,
        district: district || undefined,
        ...geoDefaultsForCountry(countryCode),
        phoneE164: phone,
        email: raw.email?.trim() || undefined,
        websiteUrl: raw.website?.trim() || undefined,
        websiteDomain,
        instagram: raw.instagram?.trim() || undefined,
        facebook: raw.facebook?.trim() || undefined,
        source: "IMPORT" as const,
      };

      preview.push({
        raw,
        payload,
        status: match.type === "EXACT" ? "DUPLICATE_MERGED" : match.type === "POSSIBLE" ? "POSSIBLE_DUPLICATE" : "CREATED",
      });

      if (match.type === "NONE") {
        seenInFile.push({
          id: `pending-${seenInFile.length}`,
          websiteDomain,
          phoneE164: phone,
          instagram,
          facebook,
          normalizedName,
          district,
          countryCode,
        });
      }
    }

    setRows(preview);
  };

  const confirmImport = async () => {
    setImporting(true);
    for (const row of rows) {
      const { data, error } = await supabase.rpc("import_business", {
        ws: workspaceId,
        p_payload: row.payload,
        p_search_job_id: null,
      });
      const result = data as { businessId: string; status: string } | null;
      if (!error && result && result.status !== "DUPLICATE_MERGED") {
        try {
          await recomputeScore(workspaceId, result.businessId);
        } catch {
          // Skor hesaplanamazsa import akışı durmaz; lead 0 skorla görünür.
        }
      }
    }
    setImporting(false);
    setDone(true);
    void queryClient.invalidateQueries({ queryKey: ["businesses", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["market-options", workspaceId] });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={tr.leads.importTitle} description={tr.leads.importDescription} size="lg">
        <div className="space-y-4">
          {!done && (
            <div>
              <p className="mb-1 text-xs text-muted">{tr.leads.csvDefaultCountry}</p>
              <Select value={defaultCountry} onChange={(e) => setDefaultCountry(e.target.value)}>
                {SUPPORTED_COUNTRY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {countryFlag(code)} {getCountryProfile(code).nameTr}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {!done && (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-center text-sm text-muted hover:border-primary">
              <span className="font-medium text-text">{tr.leads.importChooseFile}</span>
              <span className="text-xs">.csv</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onFile(file);
                }}
              />
            </label>
          )}

          {rows.length > 0 && !done && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-text">
                {tr.leads.importPreview} ({rows.length})
              </h3>
              <div className="max-h-64 overflow-auto rounded-lg border border-border">
                <Table>
                  <thead>
                    <tr>
                      <Th>{tr.leads.nameLabel}</Th>
                      <Th>{tr.leads.columns.status}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i}>
                        <Td>{row.raw.name}</Td>
                        <Td>
                          {row.status === "CREATED" && <Badge tone="green">{tr.leads.importStatusNew}</Badge>}
                          {row.status === "POSSIBLE_DUPLICATE" && <Badge tone="orange">{tr.leads.importStatusPossible}</Badge>}
                          {row.status === "DUPLICATE_MERGED" && <Badge tone="gray">{tr.leads.importStatusDuplicate}</Badge>}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              <Button onClick={() => void confirmImport()} disabled={importing}>
                {tr.leads.importConfirm}
              </Button>
            </div>
          )}

          {done && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-[#4ade80]">{tr.leads.importDone}</p>}

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              {done ? tr.common.close : tr.common.cancel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
