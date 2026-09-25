import { useState } from "react";
import Papa from "papaparse";
import { useQueryClient } from "@tanstack/react-query";
import {
  classifyMatch,
  normalizeDomain,
  normalizePhone,
  normalizeSocial,
  type DedupeCandidate,
} from "@lbf/core";
import { supabase } from "../../lib/supabase-client";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";

interface ImportCsvDialogProps {
  workspaceId: string;
  onClose: () => void;
}

interface CsvRow {
  name?: string;
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
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = Papa.parse<CsvRow>(text, { header: true, skipEmptyLines: true });

    const { data: existingRaw } = await supabase
      .from("businesses")
      .select("id, google_place_id, website_domain, primary_phone_e164, normalized_name, district")
      .eq("workspace_id", workspaceId)
      .is("merged_into", null);

    const existing: DedupeCandidate[] = (existingRaw ?? []).map((b) => ({
      id: b.id as string,
      googlePlaceId: b.google_place_id as string | null,
      websiteDomain: b.website_domain as string | null,
      phoneE164: b.primary_phone_e164 as string | null,
      normalizedName: b.normalized_name as string,
      district: b.district as string | null,
    }));

    const seenInFile: DedupeCandidate[] = [];
    const preview: PreviewRow[] = [];

    for (const raw of parsed.data) {
      const name = raw.name?.trim();
      if (!name) continue;

      const phone = raw.phone ? normalizePhone(raw.phone)?.e164 ?? undefined : undefined;
      const instagram = raw.instagram ? (normalizeSocial(raw.instagram, "INSTAGRAM") ?? undefined) : undefined;
      const facebook = raw.facebook ? (normalizeSocial(raw.facebook, "FACEBOOK") ?? undefined) : undefined;
      const websiteDomain = raw.website ? normalizeDomain(raw.website) || undefined : undefined;
      const normalizedName = name.toLowerCase();
      const district = raw.district?.trim();

      const match = classifyMatch(
        { websiteDomain, phoneE164: phone, instagram, facebook, normalizedName, district },
        [...existing, ...seenInFile],
      );

      const payload = {
        name,
        category: raw.category?.trim() || undefined,
        city: raw.city?.trim() || undefined,
        district: district || undefined,
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
        });
      }
    }

    setRows(preview);
  };

  const confirmImport = async () => {
    setImporting(true);
    for (const row of rows) {
      await supabase.rpc("import_business", {
        ws: workspaceId,
        p_payload: row.payload,
        p_search_job_id: null,
      });
    }
    setImporting(false);
    setDone(true);
    void queryClient.invalidateQueries({ queryKey: ["businesses", workspaceId] });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl space-y-4 overflow-auto rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-slate-900">{tr.leads.importTitle}</h2>
        <p className="text-sm text-slate-500">{tr.leads.importDescription}</p>

        {!done && (
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
            className="text-sm"
          />
        )}

        {rows.length > 0 && !done && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-700">{tr.leads.importPreview}</h3>
            <div className="max-h-64 overflow-auto rounded-md border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-1">Ad</th>
                    <th className="px-2 py-1">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1">{row.raw.name}</td>
                      <td className="px-2 py-1">
                        {row.status === "CREATED" && tr.leads.importStatusNew}
                        {row.status === "POSSIBLE_DUPLICATE" && tr.leads.importStatusPossible}
                        {row.status === "DUPLICATE_MERGED" && tr.leads.importStatusDuplicate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button onClick={() => void confirmImport()} disabled={importing}>
              {tr.leads.importConfirm}
            </Button>
          </div>
        )}

        {done && <p className="text-sm text-green-700">{tr.leads.importDone}</p>}

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            {tr.common.cancel}
          </Button>
        </div>
      </div>
    </div>
  );
}
