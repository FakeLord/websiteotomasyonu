import { tr } from "../i18n/tr";

export interface NavItem {
  path: string;
  label: string;
}

/**
 * Sidebar'daki 9 sayfanın tek kaynağı (SPEC.md → D bölümü, MVP modülleri).
 * Router ve layout bu listeyi kullanır; sıra ürün önceliğini yansıtır.
 */
export const navItems: NavItem[] = [
  { path: "/", label: tr.nav.dashboard },
  { path: "/discover", label: tr.nav.discover },
  { path: "/leads", label: tr.nav.leads },
  { path: "/conversations", label: tr.nav.conversations },
  { path: "/follow-ups", label: tr.nav.followUps },
  { path: "/activity-log", label: tr.nav.activityLog },
  { path: "/team", label: tr.nav.team },
  { path: "/knowledge-base", label: tr.nav.knowledgeBase },
  { path: "/settings", label: tr.nav.settings },
];
