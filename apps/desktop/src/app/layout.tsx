import { NavLink, Outlet } from "react-router-dom";
import { tr } from "../i18n/tr";
import { OnlineBanner } from "../components/online-banner";
import { cn } from "../lib/cn";
import { navItems } from "./nav-items";

export function AppLayout() {
  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <OnlineBanner />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="px-4 py-4 text-sm font-semibold text-slate-900">{tr.app.name}</div>
          <nav className="flex flex-1 flex-col gap-1 px-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100",
                    isActive && "bg-slate-900 text-white hover:bg-slate-900",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
