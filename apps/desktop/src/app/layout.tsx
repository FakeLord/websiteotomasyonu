import { NavLink, Outlet } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { tr } from "../i18n/tr";
import { OnlineBanner } from "../components/online-banner";
import { cn } from "../lib/cn";
import { navItems, type NavItem } from "./nav-items";
import { useShellCounters } from "../lib/use-shell-data";
import { useUiStore } from "../lib/ui-store";
import { Topbar } from "./topbar";
import { JarvisPanel } from "../features/jarvis/JarvisPanel";
import { AppLogo } from "../components/domain/app-logo";

function SidebarLink({ item, badgeCount }: { item: NavItem; badgeCount: number | undefined }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text",
          isActive && "bg-primary text-white shadow-lg shadow-primary/25 hover:bg-primary hover:text-white",
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
  const counters = useShellCounters().data;
  const setJarvisOpen = useUiStore((state) => state.setJarvisOpen);
  const main = navItems.filter((item) => item.group === "main");
  const workspace = navItems.filter((item) => item.group === "workspace");

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-16 items-center gap-3 px-5">
        <AppLogo />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-text">{tr.app.name}</p>
          <p className="text-[11px] text-subtle">v{__APP_VERSION__}</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
        {main.map((item) => (
          <SidebarLink key={item.path} item={item} badgeCount={item.badge ? counters?.[item.badge] : undefined} />
        ))}
        <div className="my-3 h-px bg-border" />
        {workspace.map((item) => (
          <SidebarLink key={item.path} item={item} badgeCount={undefined} />
        ))}
      </nav>
      <div className="p-3">
        <button
          type="button"
          onClick={() => setJarvisOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-violet/30 bg-gradient-to-br from-primary/20 to-violet/25 p-3 text-left transition-colors hover:border-violet/60"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet text-white">
            <Sparkles className="size-4" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-text">{tr.shell.jarvisTitle}</span>
            <span className="block text-xs text-muted">{tr.shell.jarvisSubtitle}</span>
          </span>
        </button>
      </div>
    </aside>
  );
}

export function AppLayout() {
  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      <OnlineBanner />
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
