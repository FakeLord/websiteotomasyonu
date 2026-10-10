import {
  BarChart3,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  Handshake,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Search,
  Settings,
  UserCheck,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { tr } from "../i18n/tr";

export type NavBadgeKey = "awaitingReply" | "overdueFollowUps" | "openHandoffs" | "pendingApproval";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  group: "main" | "workspace";
  badge?: NavBadgeKey;
}

/**
 * Kenar çubuğunun tek kaynağı; sıra ve gruplar tasarım referansını izler
 * (ADR 0007). Router ve layout bu listeyi kullanır.
 */
export const navItems: NavItem[] = [
  { path: "/", label: tr.nav.dashboard, icon: LayoutDashboard, group: "main" },
  { path: "/discover", label: tr.nav.discover, icon: Search, group: "main" },
  { path: "/leads", label: tr.nav.leads, icon: Users, group: "main" },
  { path: "/conversations", label: tr.nav.conversations, icon: MessagesSquare, group: "main", badge: "awaitingReply" },
  { path: "/review", label: tr.nav.review, icon: ClipboardCheck, group: "main", badge: "pendingApproval" },
  { path: "/follow-ups", label: tr.nav.followUps, icon: CalendarClock, group: "main", badge: "overdueFollowUps" },
  { path: "/pipeline", label: tr.nav.pipeline, icon: Handshake, group: "main", badge: "openHandoffs" },
  { path: "/customers", label: tr.nav.customers, icon: UserCheck, group: "main" },
  { path: "/campaigns", label: tr.nav.campaigns, icon: Megaphone, group: "main" },
  { path: "/reports", label: tr.nav.reports, icon: BarChart3, group: "main" },
  { path: "/team", label: tr.nav.team, icon: UsersRound, group: "workspace" },
  { path: "/knowledge-base", label: tr.nav.knowledgeBase, icon: BookOpen, group: "workspace" },
  { path: "/settings", label: tr.nav.settings, icon: Settings, group: "workspace" },
];
