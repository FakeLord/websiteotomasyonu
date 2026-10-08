import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc } from "../outreach/outreach";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Input, Label, Textarea } from "../../components/ui/input";
import { Dialog, DialogContent } from "../../components/ui/primitives";

interface EditCampaignDialogProps {
  campaign: { id: string; name: string; description: string | null; followup_steps: number; daily_limit: number };
  onClose: () => void;
}

/** Kampanyanın adı, açıklaması, takip adımı ve günlük limiti. Kanal ve segment değiştirilemez (üyeler ona göre eklenmiştir). */
export function EditCampaignDialog({ campaign, onClose }: EditCampaignDialogProps) {
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? "");
  const [followupSteps, setFollowupSteps] = useState(campaign.followup_steps);
  const [dailyLimit, setDailyLimit] = useState(campaign.daily_limit);

  const save = useMutation({
    mutationFn: () =>
      rpc("update_campaign", {
        p_campaign_id: campaign.id,
        p_name: name.trim(),
        p_description: description.trim() || null,
        p_followup_steps: followupSteps,
        p_daily_limit: dailyLimit,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["campaign-stats", workspaceId] });
      onClose();
    },
  });

  const valid = name.trim().length > 0 && followupSteps >= 0 && followupSteps <= 5 && dailyLimit >= 1 && dailyLimit <= 200;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={tr.campaigns.edit.title} description={tr.campaigns.edit.description}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate();
          }}
        >
          <div>
            <Label>{tr.campaigns.edit.name}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
          </div>
          <div>
            <Label>{tr.campaigns.edit.descriptionLabel}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{tr.campaigns.edit.followupSteps}</Label>
              <Input type="number" min={0} max={5} value={followupSteps} onChange={(e) => setFollowupSteps(Number(e.target.value))} />
            </div>
            <div>
              <Label>{tr.campaigns.edit.dailyLimit}</Label>
              <Input type="number" min={1} max={200} value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} />
            </div>
          </div>
          <p className="text-xs text-muted">{tr.campaigns.edit.lockedHint}</p>
          {save.isError && <p className="text-sm text-[#f87171]">{save.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {tr.common.cancel}
            </Button>
            <Button type="submit" disabled={!valid || save.isPending}>
              {save.isPending ? tr.common.loading : tr.common.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
