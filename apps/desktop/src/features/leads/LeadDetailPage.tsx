import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EraseBusinessButton } from "./EraseBusinessButton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, CheckCircle2, ChevronDown, GitMerge, MapPin, MapPinned, MessageSquarePlus, Pencil, Send, Sparkles, Star, Tag } from "lucide-react";
import {
  allowedNextStages,
  chooseChannel,
  contactOptions,
  googleMapsUrl,
  type ContactOption,
  type BusinessStage,
  type Channel,
  type OutreachChannel,
  type RoutingChannelCandidate,
} from "@lbf/core";
import { getCountryProfile } from "@lbf/core";
import { formatLocalTime } from "../../lib/format";
import { platform } from "../../lib/platform";
import { supabase } from "../../lib/supabase-client";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { useWorkspaceMembers } from "../../lib/use-workspace-members";
import { useRealtimeTable } from "../../lib/use-realtime-table";
import { tr } from "../../i18n/tr";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/input";
import { Card, CardBody, CardHeader } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Avatar } from "../../components/ui/data-display";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  PillTabsList,
  PillTabsTrigger,
  Tabs,
  TabsContent,
} from "../../components/ui/primitives";
import { ScoreBadge, StageBadge, WebsiteStatusBadge } from "../../components/domain/badges";
import { ChannelIcon } from "../../components/domain/channel-icon";
import { CustomerDealDialog } from "../customers/CustomerDealDialog";
import { useBusiness, useContactChannels, useWorkspaceSettings, type ContactChannelRow, type WorkspaceSettingsRow } from "./detail/lead-data";
import { DraftMessageDialog } from "./detail/DraftMessageDialog";
import { EditLeadDialog } from "./EditLeadDialog";
import { HandoffCard } from "./detail/HandoffCard";
import { ContactOutcomePanel, type PendingContact } from "./detail/ContactOutcomePanel";
import { logContactAttempt } from "./detail/contact-attempts";
import { OverviewTab } from "./detail/OverviewTab";
import { ProgressTab } from "./detail/ProgressTab";
import { AnalysisTab, ContactTab, ConversationsTab, NotesTab, SOCIAL_CHANNELS, WebsiteTab } from "./detail/tabs";
import type { BusinessDetail } from "./types";

const OUTREACH: Channel[] = ["EMAIL", "INSTAGRAM", "FACEBOOK", "WHATSAPP", "LINKEDIN", "TIKTOK"];

function recommendChannel(business: BusinessDetail, channels: ContactChannelRow[], settings: WorkspaceSettingsRow | undefined) {
  if (!settings) return null;
  const candidates: RoutingChannelCandidate[] = channels
    .filter((c) => c.channel !== "WEBSITE_FORM")
    .map((c) => ({ channel: c.channel as Channel, status: c.status, confidence: Number(c.confidence) }));
  return chooseChannel({
    doNotContact: business.do_not_contact,
    candidates,
    settings: { channelPriority: settings.channel_priority, channelModes: settings.channel_modes },
    history: { lastMessageAtByChannel: {}, firstMessageChannelWithin30Days: null, dailyCountByChannel: {}, dailyCountTotal: 0 },
    limits: {
      dailyTotal: settings.outreach_limits.daily_total,
      dailyByChannel: settings.outreach_limits.channels as Partial<Record<Channel, number>>,
      channelCooldownHours: settings.outreach_limits.channel_cooldown_hours,
    },
    now: new Date(),
  });
}

function SalesPanel({
  business,
  recommended,
  onWon,
}: {
  business: BusinessDetail;
  recommended: ReturnType<typeof recommendChannel>;
  onWon: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { members } = useWorkspaceMembers();
  const nextStages = allowedNextStages(business.stage);
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["business", business.id] });
    void queryClient.invalidateQueries({ queryKey: ["stage-transitions", business.id] });
  };

  const transition = useMutation({
    mutationFn: async (toStage: BusinessStage) => {
      const { error } = await supabase.rpc("transition_stage", {
        p_business_id: business.id,
        p_to_stage: toStage,
        p_reason: null,
        p_expected_version: business.version,
      });
      if (error) throw error;
      return toStage;
    },
    onSuccess: (toStage) => {
      invalidate();
      if (toStage === "WON") onWon();
    },
  });

  const assign = useMutation({
    mutationFn: async (userId: string | null) => {
      const { error } = await supabase.rpc("assign_business", { p_business_id: business.id, p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const dnc = useMutation({
    mutationFn: async (value: boolean) => {
      let reason: string | null = null;
      if (!value) {
        reason = window.prompt(tr.leads.dncReasonPrompt) ?? "";
        if (!reason.trim()) return;
      }
      const { error } = await supabase.rpc("set_dnc", { p_business_id: business.id, p_value: value, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const duplicateTarget = useQuery({
    queryKey: ["business-name", business.possible_duplicate_of],
    enabled: !!business.possible_duplicate_of,
    queryFn: async () => {
      const { data, error } = await supabase.from("businesses").select("id, name").eq("id", business.possible_duplicate_of as string).single();
      if (error) throw error;
      return data as { id: string; name: string };
    },
  });

  const merge = useMutation({
    mutationFn: async (keepId: string) => {
      const { error } = await supabase.rpc("merge_businesses", { p_keep_id: keepId, p_drop_id: business.id });
      if (error) throw error;
      return keepId;
    },
    onSuccess: (keepId) => navigate(`/leads/${keepId}`, { replace: true }),
  });

  const error = transition.error ?? assign.error ?? dnc.error ?? merge.error;

  return (
    <div className="space-y-4">
      <HandoffCard businessId={business.id} workspaceId={business.workspace_id} />
      <Card>
        <CardHeader title={tr.leadDetail.salesProcess} />
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">{tr.leadDetail.currentStage}</span>
            <StageBadge stage={business.stage} />
          </div>
          {nextStages.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-muted">{tr.leadDetail.moveTo}</p>
              <div className="flex flex-wrap gap-2">
                {nextStages.map((stage) => (
                  <Button key={stage} size="sm" variant="outline" disabled={transition.isPending} onClick={() => transition.mutate(stage)}>
                    {tr.stages[stage]}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-1.5 text-xs text-muted">{tr.leads.assignLabel}</p>
            <Select value={business.assigned_to ?? ""} disabled={assign.isPending} onChange={(e) => assign.mutate(e.target.value || null)}>
              <option value="">{tr.leads.unassigned}</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant={business.do_not_contact ? "outline" : "danger"}
            size="sm"
            className="w-full"
            disabled={dnc.isPending}
            onClick={() => dnc.mutate(!business.do_not_contact)}
          >
            <Ban />
            {business.do_not_contact ? tr.leads.dncToggleOff : tr.leads.dncToggleOn}
          </Button>
          {business.stage === "WON" && (
            <Button size="sm" variant="outline" className="w-full" onClick={onWon}>
              <CheckCircle2 />
              {tr.customers.editDeal}
            </Button>
          )}
          {error && <p className="text-xs text-danger">{error instanceof Error ? error.message : tr.common.error}</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={tr.routing.title} />
        <CardBody>
          {!recommended ? null : recommended.ok ? (
            <div className="flex items-center gap-3">
              <ChannelIcon channel={recommended.channel} boxed />
              <div>
                <p className="text-sm font-medium text-text">{tr.channels[recommended.channel]}</p>
                <p className="text-xs text-muted">{tr.channelModes[recommended.mode]}</p>
              </div>
            </div>
          ) : recommended.doNotContact ? (
            <p className="text-sm text-danger">{tr.routing.doNotContact}</p>
          ) : (
            <p className="text-sm text-muted">{tr.routing.noChannel}</p>
          )}
        </CardBody>
      </Card>

      {business.possible_duplicate_of && duplicateTarget.data && (
        <Card className="border-warning/40">
          <CardBody className="space-y-3 pt-4">
            <p className="text-sm text-warning">
              {tr.leads.possibleDuplicateBanner} ({duplicateTarget.data.name})
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (window.confirm(tr.leads.mergeConfirm)) merge.mutate(duplicateTarget.data!.id);
              }}
            >
              <GitMerge />
              {tr.leads.mergeButton}
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export function LeadDetailPage() {
  const { businessId } = useParams<{ businessId: string }>();
  const navigate = useNavigate();
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const businessQuery = useBusiness(businessId);
  const channelsQuery = useContactChannels(businessId);
  const settings = useWorkspaceSettings().data;
  const [draftOpen, setDraftOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pending, setPending] = useState<PendingContact | null>(null);
  const queryClient = useQueryClient();
  useRealtimeTable("businesses", workspaceId, ["business", businessId]);

  if (!businessQuery.data || !workspaceId) {
    return <p className="text-sm text-muted">{businessQuery.isError ? tr.common.error : tr.common.loading}</p>;
  }

  const business = businessQuery.data;
  const channels = channelsQuery.data ?? [];
  const recommended = recommendChannel(business, channels, settings);
  const recommendedChannel = recommended?.ok && recommended.channel !== "PHONE" ? (recommended.channel as OutreachChannel) : null;
  const location = [business.district, business.city].filter(Boolean).join(", ");
  const countryName = getCountryProfile(business.country_code).nameTr;
  const localTime = business.timezone ? formatLocalTime(business.timezone) : "";
  const mapsUrl = googleMapsUrl({
    name: business.name,
    address: business.address,
    city: business.city,
    googlePlaceId: business.google_place_id,
  });
  const contacts = contactOptions(
    channels.map((c) => ({ channel: c.channel, value: c.value, normalizedValue: c.normalized_value, status: c.status })),
    business.primary_phone_e164,
  );
  const openLink = (url: string) => {
    // mailto: yeni sekme açmadan e-posta uygulamasına gitsin.
    if (url.startsWith("mailto:")) window.location.href = url;
    else void platform.openExternal(url);
  };
  // Önce bağlantı açılır (tarayıcı açılır pencereyi yalnızca tıklamanın hemen içinde izin verir), sonra temas kaydedilir.
  const contact = (option: ContactOption) => {
    openLink(option.url);
    setPending({ attemptId: null, channel: option.channel, address: option.display, error: null });
    logContactAttempt(business.id, option.channel, option.display).then(
      (attemptId) => setPending((current) => (current && current.address === option.display ? { ...current, attemptId } : current)),
      (error: unknown) =>
        setPending((current) => (current ? { ...current, error: error instanceof Error ? error.message : tr.common.error } : current)),
    );
    void queryClient.invalidateQueries({ queryKey: ["business", business.id] });
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" />
        {tr.leads.backToList}
      </button>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-5 p-5">
          <Avatar name={business.name} size="xl" square />
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="flex items-start gap-2 text-xl font-semibold tracking-tight text-text">
              {business.name}
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                aria-label={tr.leadEdit.open}
                title={tr.leadEdit.open}
                className="mt-1 shrink-0 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-text"
              >
                <Pencil className="size-4" />
              </button>
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <WebsiteStatusBadge status={business.website_status} />
              {business.business_status === "OPERATIONAL" && <Badge tone="green">{tr.businessStatus.OPERATIONAL}</Badge>}
              <StageBadge stage={business.stage} />
              {business.do_not_contact && <Badge tone="red">DNC</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              {business.rating !== null && (
                <span className="flex items-center gap-1">
                  <Star className="size-4 fill-warning text-warning" />
                  <span className="text-text">{business.rating.toLocaleString("tr-TR")}</span>({tr.leadDetail.reviews(business.review_count ?? 0)})
                </span>
              )}
              {business.category && (
                <span className="flex items-center gap-1">
                  <Tag className="size-4" />
                  {business.category}
                </span>
              )}
              {location && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-4" />
                  {location}
                </span>
              )}
              <span className="flex items-center gap-1" title={business.timezone ?? undefined}>
                {business.country_code} · {countryName}
                {localTime && <span className="text-subtle">· {tr.leadDetail.localTime}: {localTime}</span>}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <ScoreBadge score={business.lead_score} size="lg" />
              <p className="mt-1 text-xs text-muted">{tr.leadDetail.leadScore}</p>
            </div>
            <div className="flex flex-col gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button disabled={business.do_not_contact}>
                    <Send />
                    {tr.leadDetail.contactMenu}
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-80">
                  <DropdownMenuLabel>{contacts.length > 0 ? tr.leadDetail.contactMenuTitle : tr.leadDetail.contactMenuNone}</DropdownMenuLabel>
                  {contacts.map((option) => (
                    <DropdownMenuItem key={option.url} onSelect={() => contact(option)}>
                      <ChannelIcon channel={option.channel} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-text">{tr.leadDetail.contactKinds[option.channel]}</span>
                        <span className="block truncate text-xs text-muted">{option.display}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => openLink(mapsUrl)}>
                    <MapPinned />
                    {tr.leadDetail.contactMenuMaps}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" onClick={() => openLink(mapsUrl)}>
                <MapPinned />
                {tr.leadDetail.openMaps}
              </Button>
              <EraseBusinessButton businessId={business.id} />
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="default" onClick={() => setDraftOpen(true)} disabled={business.do_not_contact}>
                <Sparkles />
                {tr.leadDetail.aiDraft}
              </Button>
              <Button variant="outline" onClick={() => setDraftOpen(true)} disabled={business.do_not_contact}>
                <MessageSquarePlus />
                {tr.leadDetail.startConversation}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Tabs defaultValue="overview" className="min-w-0 space-y-4">
          <PillTabsList>
            <PillTabsTrigger value="overview">{tr.leadDetail.tabs.overview}</PillTabsTrigger>
            <PillTabsTrigger value="progress">{tr.leadDetail.tabs.progress}</PillTabsTrigger>
            <PillTabsTrigger value="website">{tr.leadDetail.tabs.website}</PillTabsTrigger>
            <PillTabsTrigger value="contact">{tr.leadDetail.tabs.contact}</PillTabsTrigger>
            <PillTabsTrigger value="social">{tr.leadDetail.tabs.social}</PillTabsTrigger>
            <PillTabsTrigger value="analysis">{tr.leadDetail.tabs.analysis}</PillTabsTrigger>
            <PillTabsTrigger value="notes">{tr.leadDetail.tabs.notes}</PillTabsTrigger>
            <PillTabsTrigger value="conversations">{tr.leadDetail.tabs.conversations}</PillTabsTrigger>
          </PillTabsList>
          <TabsContent value="overview">
            <OverviewTab business={business} channels={channels} settings={settings} />
          </TabsContent>
          <TabsContent value="progress">
            <ProgressTab business={business} />
          </TabsContent>
          <TabsContent value="website">
            <WebsiteTab business={business} workspaceId={workspaceId} />
          </TabsContent>
          <TabsContent value="contact">
            <ContactTab business={business} workspaceId={workspaceId} channels={channels} />
          </TabsContent>
          <TabsContent value="social">
            <ContactTab business={business} workspaceId={workspaceId} channels={channels} only={SOCIAL_CHANNELS} />
          </TabsContent>
          <TabsContent value="analysis">
            <AnalysisTab business={business} />
          </TabsContent>
          <TabsContent value="notes">
            <NotesTab business={business} workspaceId={workspaceId} />
          </TabsContent>
          <TabsContent value="conversations">
            <ConversationsTab business={business} onDraft={() => setDraftOpen(true)} />
          </TabsContent>
        </Tabs>

        <SalesPanel business={business} recommended={recommended} onWon={() => setDealOpen(true)} />
      </div>

      {draftOpen && (
        <DraftMessageDialog
          open={draftOpen}
          onOpenChange={setDraftOpen}
          workspaceId={workspaceId}
          business={business}
          availableChannels={channels.map((c) => c.channel).filter((c) => OUTREACH.includes(c as Channel))}
          recommendedChannel={recommendedChannel}
        />
      )}
      {pending && <ContactOutcomePanel key={`${pending.channel}:${pending.address}`} businessId={business.id} pending={pending} onClose={() => setPending(null)} />}
      {editOpen && <EditLeadDialog business={business} workspaceId={workspaceId} onClose={() => setEditOpen(false)} />}
      {dealOpen && <CustomerDealDialog open={dealOpen} onOpenChange={setDealOpen} businessId={business.id} businessName={business.name} countryCode={business.country_code} />}
    </div>
  );
}
