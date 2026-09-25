import { createHashRouter } from "react-router-dom";
import { RouteGuard } from "./route-guard";
import { AppLayout } from "./layout";
import { LoginPage } from "../features/auth/LoginPage";
import { ResetPasswordPage } from "../features/auth/ResetPasswordPage";
import { InvitePendingPage } from "../features/auth/InvitePendingPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { DiscoverPage } from "../features/discover/DiscoverPage";
import { LeadsPage } from "../features/leads/LeadsPage";
import { ConversationsPage } from "../features/conversations/ConversationsPage";
import { FollowUpsPage } from "../features/followups/FollowUpsPage";
import { ActivityLogPage } from "../features/activity-log/ActivityLogPage";
import { TeamPage } from "../features/team/TeamPage";
import { KnowledgeBasePage } from "../features/knowledge-base/KnowledgeBasePage";
import { SettingsPage } from "../features/settings/SettingsPage";

/**
 * Tauri'nin webview'ında dosya tabanlı history yerine hash router kullanılır
 * (üretim build'inde `file://` kökeninden servis edilir). RouteGuard, oturum ve
 * workspace üyeliği durumuna göre login/invite-pending/asıl uygulama arasında
 * yönlendirir; sidebar yalnızca asıl uygulama sayfalarını sarar.
 */
export const router = createHashRouter([
  {
    element: <RouteGuard />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/reset-password", element: <ResetPasswordPage /> },
      { path: "/invite-pending", element: <InvitePendingPage /> },
      {
        element: <AppLayout />,
        children: [
          { path: "/", element: <DashboardPage /> },
          { path: "/discover", element: <DiscoverPage /> },
          { path: "/leads", element: <LeadsPage /> },
          { path: "/conversations", element: <ConversationsPage /> },
          { path: "/follow-ups", element: <FollowUpsPage /> },
          { path: "/activity-log", element: <ActivityLogPage /> },
          { path: "/team", element: <TeamPage /> },
          { path: "/knowledge-base", element: <KnowledgeBasePage /> },
          { path: "/settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
]);
