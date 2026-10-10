import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight, Loader2, Send, Sparkles, X } from "lucide-react";
import { leadFilterToSearchParams, type JarvisReply } from "@lbf/core";
import { tr } from "../../i18n/tr";
import { supabase } from "../../lib/supabase-client";
import { useUiStore } from "../../lib/ui-store";
import { useWorkspaceMembership } from "../../lib/use-workspace-membership";
import { functionErrorMessage } from "../../lib/function-error";
import { cn } from "../../lib/cn";

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  action?: JarvisReply["action"];
  error?: boolean;
}

export const JARVIS_QUICK_PROMPTS = [
  tr.jarvis.quick.topDental,
  tr.jarvis.quick.repliedToday,
  tr.jarvis.quick.proposalStage,
  tr.jarvis.quick.draftIdeas,
  tr.jarvis.quick.weeklyReport,
] as const;

export function JarvisPanel() {
  const navigate = useNavigate();
  const open = useUiStore((state) => state.jarvisOpen);
  const setOpen = useUiStore((state) => state.setJarvisOpen);
  const pendingPrompt = useUiStore((state) => state.jarvisPrompt);
  const consumePrompt = useUiStore((state) => state.consumeJarvisPrompt);
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const ask = useMutation({
    mutationFn: async (history: ChatEntry[]): Promise<JarvisReply> => {
      const { data, error } = await supabase.functions.invoke("jarvis-chat", {
        body: {
          workspaceId,
          messages: history.filter((e) => !e.error).map((e) => ({ role: e.role, content: e.content })),
        },
      });
      if (error) throw new Error(await functionErrorMessage(error, tr.jarvis.error));
      return data as JarvisReply;
    },
    onSuccess: (reply) => setEntries((prev) => [...prev, { role: "assistant", content: reply.answer, action: reply.action }]),
    onError: (err) =>
      setEntries((prev) => [...prev, { role: "assistant", content: err instanceof Error ? err.message : tr.jarvis.error, error: true }]),
  });

  const send = (text: string) => {
    const content = text.trim();
    if (!content || ask.isPending || !workspaceId) return;
    const history: ChatEntry[] = [...entries, { role: "user", content }];
    setEntries(history);
    setDraft("");
    ask.mutate(history);
  };

  useEffect(() => {
    if (open && pendingPrompt && workspaceId) {
      const prompt = consumePrompt();
      if (prompt) send(prompt);
    }
  }, [open, pendingPrompt, workspaceId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries, ask.isPending]);

  if (!open) return null;

  const runAction = (action: NonNullable<JarvisReply["action"]>) => {
    if (action.type === "navigate") navigate(action.path);
    else navigate(`/leads?${leadFilterToSearchParams(action.filter)}`);
  };

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-border bg-sidebar" aria-label={tr.shell.jarvisTitle}>
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        <span className="flex size-9 items-center justify-center rounded-md bg-primary text-white">
          <Sparkles className="size-4" />
        </span>
        <div className="flex-1 leading-tight">
          <p className="text-sm font-semibold text-text">{tr.shell.jarvisTitle}</p>
          <p className="text-xs text-muted">{tr.jarvis.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text"
          aria-label={tr.common.close}
        >
          <X className="size-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {entries.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">{tr.jarvis.intro}</p>
            <div className="space-y-2">
              {JARVIS_QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => send(prompt)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm text-text transition-colors hover:border-primary/60"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {entries.map((entry, index) => (
          <div key={index} className={cn("flex", entry.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
                entry.role === "user" && "bg-primary text-white",
                entry.role === "assistant" && !entry.error && "border border-border bg-surface text-text",
                entry.error && "border border-danger/40 bg-danger/10 text-danger",
              )}
            >
              {entry.content}
              {entry.action && (
                <button
                  type="button"
                  onClick={() => runAction(entry.action!)}
                  className="mt-2 flex items-center gap-1.5 rounded-md bg-primary/15 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/25"
                >
                  {entry.action.label}
                  <ArrowUpRight className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
        {ask.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" />
            {tr.jarvis.thinking}
          </div>
        )}
      </div>

      <form
        className="border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 pr-1.5 pl-3 focus-within:border-primary">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={tr.jarvis.placeholder}
            className="h-10 flex-1 bg-transparent text-sm text-text placeholder:text-subtle focus-visible:outline-none"
            aria-label={tr.jarvis.placeholder}
          />
          <button
            type="submit"
            disabled={!draft.trim() || ask.isPending}
            className="flex size-8 items-center justify-center rounded-md bg-primary text-white disabled:opacity-40"
            aria-label={tr.jarvis.send}
          >
            <Send className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-[11px] text-subtle">{tr.jarvis.readOnlyNote}</p>
      </form>
    </aside>
  );
}
