import { createHashRouter } from "react-router-dom";
import { AppLayout } from "./layout";
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
 * (üretim build'inde `file://` kökeninden servis edilir).
 */
export const router = createHashRouter([
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
]);
