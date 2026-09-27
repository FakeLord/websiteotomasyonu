import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useUiStore } from "../../lib/ui-store";
import { TURKISH_CITIES } from "../../lib/use-shell-data";
import { DISCOVER_CATEGORIES } from "../../lib/geo";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label, Select, Textarea } from "../../components/ui/input";
import { Dialog, DialogContent } from "../../components/ui/primitives";
import { rpc } from "../outreach/outreach";
import type { CampaignSegment } from "./campaign-data";

const CHANNELS = ["EMAIL", "INSTAGRAM", "FACEBOOK", "WHATSAPP", "LINKEDIN", "TIKTOK"] as const;
const WEBSITE_STATUSES = ["NO_WEBSITE", "BROKEN_WEBSITE", "LOW_QUALITY_WEBSITE", "GOOD_WEBSITE"] as const;
const STAGES = ["NEW", "QUALIFIED", "OUTREACH_READY", "CONTACTED", "REPLIED", "ENGAGED"] as const;

export function CreateCampaignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const globalCity = useUiStore((state) => state.city);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("EMAIL");
  const [city, setCity] = useState(globalCity);
  const [district, setDistrict] = useState("");
  const [category, setCategory] = useState("");
  const [minScore, setMinScore] = useState(40);
  const [websiteStatuses, setWebsiteStatuses] = useState<string[]>(["NO_WEBSITE", "LOW_QUALITY_WEBSITE"]);
  const [stages, setStages] = useState<string[]>(["NEW", "QUALIFIED", "OUTREACH_READY"]);
  const [followupSteps, setFollowupSteps] = useState(2);
  const [dailyLimit, setDailyLimit] = useState(20);

  const toggle = (list: string[], value: string, set: (v: string[]) => void) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const create = useMutation({
    mutationFn: async () => {
      const segment: CampaignSegment = {
        ...(city ? { city } : {}),
        ...(district.trim() ? { district: district.trim() } : {}),
        ...(category ? { category } : {}),
        ...(minScore > 0 ? { minScore } : {}),
        ...(websiteStatuses.length ? { websiteStatuses } : {}),
        ...(stages.length ? { stages } : {}),
      };
      const id = await rpc<string>("create_campaign", {
        ws: workspaceId,
        p_name: name.trim(),
        p_description: description.trim() || null,
        p_channel: channel,
        p_segment: segment,
        p_followup_steps: followupSteps,
        p_daily_limit: dailyLimit,
      });
      const added = await rpc<number>("populate_campaign_members", { p_campaign_id: id, p_limit: 500 });
      return { id, added };
    },
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["campaign-stats", workspaceId] });
      onOpenChange(false);
      navigate(`/campaigns/${id}`);
    },
  });

  const preview = useMutation({
    mutationFn: async () => {
      let q = supabase
        .from("businesses")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId as string)
        .is("merged_into", null)
        .eq("do_not_contact", false);
      if (city) q = q.ilike("city", city.replace(/[İIıi]/g, "_"));
      if (district.trim()) q = q.ilike("district", district.trim().replace(/[İIıi]/g, "_"));
      if (category) q = q.ilike("category", `%${category.replace(/[İIıi]/g, "_")}%`);
      if (minScore > 0) q = q.gte("lead_score", minScore);
      if (websiteStatuses.length) q = q.in("website_status", websiteStatuses);
      if (stages.length) q = q.in("stage", stages);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={tr.campaigns.createTitle} description={tr.campaigns.createDescription} size="xl">
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-3">
            <div>
              <Label>{tr.campaigns.name}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr.campaigns.namePlaceholder} required />
            </div>
            <div>
              <Label>{tr.campaigns.descriptionLabel}</Label>
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label>{tr.draft.channelLabel}</Label>
              <Select value={channel} onChange={(e) => setChannel(e.target.value as (typeof CHANNELS)[number])}>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {tr.channels[c]}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-subtle">{tr.campaigns.channelHint}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{tr.campaigns.followupSteps}</Label>
                <Input type="number" min={0} max={5} value={followupSteps} onChange={(e) => setFollowupSteps(Number(e.target.value))} />
              </div>
              <div>
                <Label>{tr.campaigns.dailyLimit}</Label>
                <Input type="number" min={1} max={200} value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} />
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl bg-surface-2 p-4">
            <p className="text-sm font-medium text-text">{tr.campaigns.segment}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{tr.discover.cityLabel}</Label>
                <Select value={city} onChange={(e) => setCity(e.target.value)}>
                  <option value="">{tr.shell.allCities}</option>
                  {TURKISH_CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{tr.discover.districtLabel}</Label>
                <Input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder={tr.discover.districtPlaceholder} />
              </div>
              <div>
                <Label>{tr.discover.categoryLabel}</Label>
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">{tr.common.all}</option>
                  {DISCOVER_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{tr.leads.filterLabels.minScore}</Label>
                <Input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
              </div>
            </div>
            <div>
              <Label>{tr.leads.columns.website}</Label>
              <div className="flex flex-wrap gap-2">
                {WEBSITE_STATUSES.map((s) => (
                  <label key={s} className="flex items-center gap-1.5 rounded-md bg-surface-3 px-2 py-1 text-xs text-text">
                    <input type="checkbox" checked={websiteStatuses.includes(s)} onChange={() => toggle(websiteStatuses, s, setWebsiteStatuses)} />
                    {tr.websiteAnalysis.status[s]}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>{tr.leads.filterLabels.stage}</Label>
              <div className="flex flex-wrap gap-2">
                {STAGES.map((s) => (
                  <label key={s} className="flex items-center gap-1.5 rounded-md bg-surface-3 px-2 py-1 text-xs text-text">
                    <input type="checkbox" checked={stages.includes(s)} onChange={() => toggle(stages, s, setStages)} />
                    {tr.stages[s]}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button type="button" size="sm" variant="outline" disabled={preview.isPending} onClick={() => preview.mutate()}>
                {tr.campaigns.previewCount}
              </Button>
              {preview.data !== undefined && <span className="text-sm text-text">{tr.campaigns.matching(preview.data)}</span>}
            </div>
            <p className="text-xs text-subtle">{tr.campaigns.segmentNote}</p>
          </div>

          {create.isError && (
            <p className="text-sm text-[#f87171] md:col-span-2">{create.error instanceof Error ? create.error.message : tr.common.error}</p>
          )}
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {tr.common.cancel}
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {tr.campaigns.create}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
