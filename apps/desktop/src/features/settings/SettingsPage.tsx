import { useSearchParams } from "react-router-dom";
import { CalendarClock, Database, Gauge, KeyRound, Mail, Plug, UserRound } from "lucide-react";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { tr } from "../../i18n/tr";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/data-display";
import { Card } from "../../components/ui/card";
import { ScoringSettingsSection } from "./ScoringSettingsSection";
import { EmailAccountSection } from "./EmailAccountSection";
import { DataExportSection } from "./DataExportSection";
import { AiProvidersSection } from "./AiProvidersSection";
import { FollowupPolicySection, GeneralSection, IntegrationsSection } from "./OtherSections";

const SECTIONS = [
  { key: "general", icon: UserRound, adminOnly: false },
  { key: "api", icon: KeyRound, adminOnly: true },
  { key: "email", icon: Mail, adminOnly: false },
  { key: "scoring", icon: Gauge, adminOnly: true },
  { key: "followup", icon: CalendarClock, adminOnly: true },
  { key: "integrations", icon: Plug, adminOnly: false },
  { key: "data", icon: Database, adminOnly: false },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

export function SettingsPage() {
  const membership = useWorkspaceMembership().data;
  const workspaceId = membership?.workspaceId;
  const isAdmin = membership?.role === "ADMIN";
  const [params, setParams] = useSearchParams();
  const requested = params.get("section") as SectionKey | null;
  const active: SectionKey = SECTIONS.some((s) => s.key === requested) ? (requested as SectionKey) : "general";
  const activeSection = SECTIONS.find((s) => s.key === active)!;

  return (
    <div>
      <PageHeader title={tr.settings.title} />
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Card className="h-fit p-2">
          <nav className="flex flex-col gap-0.5">
            {SECTIONS.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => setParams({ section: section.key }, { replace: true })}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                  active === section.key ? "bg-primary text-white" : "text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                <section.icon className="size-4" />
                {tr.settings.sections[section.key]}
              </button>
            ))}
          </nav>
        </Card>

        <div className="min-w-0">
          {activeSection.adminOnly && !isAdmin ? (
            <Card className="p-6 text-sm text-muted">{tr.settings.adminOnly}</Card>
          ) : (
            workspaceId && (
              <>
                {active === "general" && <GeneralSection />}
                {active === "api" && <AiProvidersSection workspaceId={workspaceId} />}
                {active === "email" && <EmailAccountSection />}
                {active === "scoring" && (
                  <Card className="p-5">
                    <ScoringSettingsSection workspaceId={workspaceId} />
                  </Card>
                )}
                {active === "followup" && <FollowupPolicySection workspaceId={workspaceId} />}
                {active === "integrations" && <IntegrationsSection />}
                {active === "data" && <DataExportSection workspaceId={workspaceId} />}
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
