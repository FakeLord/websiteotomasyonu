import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MessagesSquare, Search } from "lucide-react";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { formatRelative } from "../../lib/format";
import { tr } from "../../i18n/tr";
import { cn } from "../../lib/cn";
import { Card } from "../../components/ui/card";
import { Avatar, EmptyState } from "../../components/ui/data-display";
import { ChannelIcon } from "../../components/domain/channel-icon";
import { ConversationThread } from "./ConversationThread";
import { ConversationSidebar } from "./ConversationSidebar";
import { isAwaitingReply, useConversations } from "./conversation-data";

type ListFilter = "all" | "awaiting" | "drafts" | "closed";

export function ConversationsPage() {
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const conversationsQuery = useConversations();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ListFilter>("all");
  const selectedId = params.get("c");

  const conversations = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("tr-TR");
    return (conversationsQuery.data ?? []).filter((c) => {
      if (term && !(c.businesses?.name ?? "").toLocaleLowerCase("tr-TR").includes(term)) return false;
      const last = c.messages[0];
      if (filter === "awaiting") return isAwaitingReply(c);
      if (filter === "drafts") return last?.status === "DRAFT";
      if (filter === "closed") return c.status === "CLOSED";
      return c.status === "OPEN";
    });
  }, [conversationsQuery.data, search, filter]);

  const selected = (conversationsQuery.data ?? []).find((c) => c.id === selectedId) ?? null;
  const select = (id: string) => setParams({ c: id }, { replace: true });

  return (
    <div className="grid h-[calc(100vh-7rem)] min-h-[560px] gap-4 xl:grid-cols-[320px_minmax(0,1fr)_300px] lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="flex min-h-0 flex-col">
        <div className="space-y-3 border-b border-border p-3">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold text-text">{tr.nav.conversations}</h1>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr.conversations.searchPlaceholder}
              className="h-9 w-full rounded-lg border border-border bg-surface-2 pr-3 pl-9 text-sm text-text placeholder:text-subtle focus-visible:border-primary focus-visible:outline-none"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "awaiting", "drafts", "closed"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium",
                  filter === f ? "bg-primary text-white" : "text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                {tr.conversations.filters[f]}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {conversations.length === 0 && <li className="p-4 text-center text-sm text-muted">{tr.conversations.empty}</li>}
          {conversations.map((c) => {
            const last = c.messages[0];
            const awaiting = isAwaitingReply(c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => select(c.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg p-2.5 text-left transition-colors",
                    selectedId === c.id ? "bg-primary/15" : "hover:bg-surface-2",
                  )}
                >
                  <div className="relative">
                    <Avatar name={c.businesses?.name ?? "?"} size="md" />
                    <span className="absolute -right-1 -bottom-1 rounded-full bg-surface p-0.5">
                      <ChannelIcon channel={c.channel} className="size-3.5" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-text">{c.businesses?.name ?? "—"}</p>
                      <span className="shrink-0 text-[11px] text-subtle">{formatRelative(last?.created_at ?? c.updated_at)}</span>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
                      {last?.status === "DRAFT" && <span className="font-medium text-primary">{tr.conversations.draftPrefix}</span>}
                      <span className="truncate">{last?.body ?? tr.conversations.noMessages}</span>
                    </p>
                  </div>
                  {awaiting && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-danger" aria-label={tr.conversations.filters.awaiting} />}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="min-h-0 overflow-hidden">
        {selected && workspaceId ? (
          <ConversationThread conversation={selected} workspaceId={workspaceId} />
        ) : (
          <EmptyState icon={MessagesSquare} title={tr.conversations.selectPrompt} description={tr.conversations.selectHint} />
        )}
      </Card>

      <div className="hidden min-h-0 overflow-y-auto xl:block">
        {selected && workspaceId && <ConversationSidebar conversation={selected} workspaceId={workspaceId} />}
      </div>
    </div>
  );
}
