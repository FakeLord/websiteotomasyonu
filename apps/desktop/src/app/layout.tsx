import { NavLink, Outlet } from "react-router-dom";
import { Bot } from "lucide-react";
import { tr } from "../i18n/tr";
import { OnlineBanner } from "../components/online-banner";
import { UpdateBanner } from "../components/update-banner";
import { cn } from "../lib/cn";
import { navItems, type NavBadgeKey, type NavItem } from "./nav-items";
import { useShellCounters } from "../lib/use-shell-data";
import { useDraftQueue } from "../lib/use-jobs";
import { useUiStore } from "../lib/ui-store";
import { Topbar } from "./topbar";
import { JarvisPanel } from "../features/jarvis/JarvisPanel";
import { AppLogo } from "../components/domain/app-logo";
import { useBackgroundWorkers } from "../lib/use-background-workers";

function SidebarLink({ item, badgeCount }: { item: NavItem; badgeCount: number | undefined }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-text transition-colors hover:bg-sidebar-hover hover:text-white",
          isActive && "bg-sidebar-active text-white hover:bg-sidebar-active",
        )
      }
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {!!badgeCount && (
        <span className="min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] leading-5 font-semibold text-white tabular-nums">
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      )}
    </NavLink>
  );
}

function Sidebar() {
  const shellCounters = useShellCounters().data;
  const draftQueue = useDraftQueue().data;
  const counters: Partial<Record<NavBadgeKey, number>> = {
    ...(shellCounters ?? {}),
    ...(draftQueue ? { pendingApproval: draftQueue.pendingApproval } : {}),
  };
  const setJarvisOpen = useUiStore((state) => state.setJarvisOpen);
  const main = navItems.filter((item) => item.group === "main");
  const workspace = navItems.filter((item) => item.group === "workspace");

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar">
      <div className="flex h-16 items-center gap-3 px-5">
        <AppLogo />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">{tr.app.name}</p>
          <p className="text-[11px] text-sidebar-muted">v{__APP_VERSION__}</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
        {main.map((item) => (
          <SidebarLink key={item.path} item={item} badgeCount={item.badge ? counters?.[item.badge] : undefined} />
        ))}
        <div className="my-3 h-px bg-sidebar-border" />
        {workspace.map((item) => (
          <SidebarLink key={item.path} item={item} badgeCount={undefined} />
        ))}
      </nav>
      <div className="p-3">
        <button
          type="button"
          onClick={() => setJarvisOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar-hover p-3 text-left transition-colors hover:bg-sidebar-active"
        >
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-white">
            <Bot className="size-4" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-white">{tr.shell.jarvisTitle}</span>
            <span className="block text-xs text-sidebar-muted">{tr.shell.jarvisSubtitle}</span>
          </span>
        </button>
      </div>
    </aside>
  );
}

export function AppLayout() {
  useBackgroundWorkers();
  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      <OnlineBanner />
      <UpdateBanner />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="min-h-0 flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
        <JarvisPanel />
      </div>
    </div>
  );
}
