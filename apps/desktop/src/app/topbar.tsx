import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, CalendarClock, ChevronDown, Handshake, LogOut, MapPin, MessagesSquare, Search, Settings } from "lucide-react";
import { tr } from "../i18n/tr";
import { supabase } from "../lib/supabase-client";
import { useUiStore } from "../lib/ui-store";
import { useWorkspaceMembership } from "../lib/use-workspace-membership";
import { turkishLikePattern } from "../lib/filters";
import { TURKISH_CITIES, useMyProfile, useShellCounters } from "../lib/use-shell-data";
import { Avatar } from "../components/ui/data-display";
import { WebsiteStatusBadge } from "../components/domain/badges";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/primitives";

interface SearchHit {
  id: string;
  name: string;
  category: string | null;
  district: string | null;
  city: string | null;
  website_status: string | null;
}

/** PostgREST `or` filtresinde virgül/parantez sözdizimini bozar; aramada gereksiz. */
function sanitizeSearch(value: string): string {
  return value.replace(/[,()%*\\]/g, " ").trim();
}

function GlobalSearch() {
  const navigate = useNavigate();
  const workspaceId = useWorkspaceMembership().data?.workspaceId;
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cleaned = sanitizeSearch(term);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hits = useQuery({
    queryKey: ["global-search", workspaceId, cleaned],
    enabled: !!workspaceId && cleaned.length >= 2,
    queryFn: async (): Promise<SearchHit[]> => {
      const pattern = turkishLikePattern(cleaned);
      const { data, error } = await supabase
        .from("businesses")
        .select("id, name, category, district, city, website_status")
        .eq("workspace_id", workspaceId as string)
        .is("merged_into", null)
        .or(`name.ilike.${pattern},category.ilike.${pattern},city.ilike.${pattern},district.ilike.${pattern}`)
        .order("lead_score", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as SearchHit[];
    },
  });

  const goToLead = (id: string) => {
    setOpen(false);
    setTerm("");
    navigate(`/leads/${id}`);
  };

  return (
    <div className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
      <input
        ref={inputRef}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && cleaned) {
            setOpen(false);
            navigate(`/leads?q=${encodeURIComponent(cleaned)}`);
          }
          if (e.key === "Escape") inputRef.current?.blur();
        }}
        placeholder={tr.shell.searchPlaceholder}
        className="h-10 w-full rounded-lg border border-border bg-surface-2 pr-16 pl-9 text-sm text-text placeholder:text-subtle focus-visible:border-primary focus-visible:outline-none"
        aria-label={tr.common.search}
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-border-strong px-1.5 text-[10px] text-subtle">
        Ctrl K
      </kbd>
      {open && cleaned.length >= 2 && (
        <div className="absolute top-full right-0 left-0 z-40 mt-2 overflow-hidden rounded-lg border border-border-strong bg-surface-2 shadow-2xl shadow-black/50">
          {hits.data?.length === 0 && <p className="px-3 py-3 text-sm text-muted">{tr.shell.searchNoResults}</p>}
          {hits.data?.map((hit) => (
            <button
              key={hit.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => goToLead(hit.id)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-3"
            >
              <Avatar name={hit.name} size="sm" square />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text">{hit.name}</span>
                <span className="block truncate text-xs text-muted">
                  {[hit.category, hit.district, hit.city].filter(Boolean).join(", ")}
                </span>
              </span>
              <WebsiteStatusBadge status={hit.website_status} />
            </button>
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen(false);
              navigate(`/leads?q=${encodeURIComponent(cleaned)}`);
            }}
            className="w-full border-t border-border px-3 py-2 text-left text-xs font-medium text-primary hover:bg-surface-3"
          >
            {tr.shell.searchOpenAll}
          </button>
        </div>
      )}
    </div>
  );
}

function CitySelector() {
  const city = useUiStore((state) => state.city);
  const setCity = useUiStore((state) => state.setCity);
  return (
    <label className="relative flex h-10 items-center gap-2 rounded-lg border border-border bg-surface-2 pr-2 pl-3 text-sm text-text">
      <MapPin className="size-4 text-primary" />
      <span className="sr-only">{tr.shell.cityLabel}</span>
      <select
        value={city}
        onChange={(e) => setCity(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent pr-5 focus-visible:outline-none"
      >
        <option value="">{tr.shell.allCities}</option>
        {TURKISH_CITIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-4 text-subtle" />
    </label>
  );
}

function NotificationsMenu() {
  const navigate = useNavigate();
  const counters = useShellCounters().data;
  const items = [
    { key: "awaitingReply", count: counters?.awaitingReply ?? 0, text: tr.shell.awaitingReply, icon: MessagesSquare, path: "/conversations" },
    { key: "overdueFollowUps", count: counters?.overdueFollowUps ?? 0, text: tr.shell.overdueFollowUps, icon: CalendarClock, path: "/follow-ups" },
    { key: "openHandoffs", count: counters?.openHandoffs ?? 0, text: tr.shell.openHandoffs, icon: Handshake, path: "/pipeline" },
  ].filter((item) => item.count > 0);
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
        aria-label={tr.shell.notifications}
      >
        <Bell className="size-[18px]" />
        {total > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 font-semibold text-white">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <DropdownMenuLabel>{tr.shell.notifications}</DropdownMenuLabel>
        {items.length === 0 && <p className="px-2.5 py-2 text-sm text-muted">{tr.shell.noNotifications}</p>}
        {items.map((item) => (
          <DropdownMenuItem key={item.key} onSelect={() => navigate(item.path)}>
            <item.icon />
            {item.text(item.count)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const navigate = useNavigate();
  const { displayName, email } = useMyProfile();
  const role = useWorkspaceMembership().data?.role;
  const roleLabel = role === "ADMIN" ? tr.shell.roleAdmin : role === "AGENT" ? tr.shell.roleAgent : tr.shell.roleMember;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg py-1 pr-2 pl-1 hover:bg-surface-2">
        <Avatar name={displayName || "?"} size="sm" />
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-36 truncate text-sm font-medium text-text">{displayName}</span>
          <span className="block text-[11px] text-muted">{roleLabel}</span>
        </span>
        <ChevronDown className="size-4 text-subtle" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/settings")}>
          <Settings />
          {tr.shell.profile}
        </DropdownMenuItem>
        <DropdownMenuItem danger onSelect={() => void supabase.auth.signOut()}>
          <LogOut />
          {tr.auth.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-bg/80 px-6 backdrop-blur">
      <GlobalSearch />
      <CitySelector />
      <div className="ml-auto flex items-center gap-1">
        <NotificationsMenu />
        <div className="mx-2 h-6 w-px bg-border" />
        <UserMenu />
      </div>
    </header>
  );
}
