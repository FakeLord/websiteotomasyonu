import { createHashRouter } from "react-router-dom";
import { RouteGuard } from "./route-guard";
import { RouteError } from "./route-error";
import { AppLayout } from "./layout";
import { LoginPage } from "../features/auth/LoginPage";
import { ResetPasswordPage } from "../features/auth/ResetPasswordPage";
import { SetPasswordPage } from "../features/auth/SetPasswordPage";
import { InvitePendingPage } from "../features/auth/InvitePendingPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { DiscoverPage } from "../features/discover/DiscoverPage";
import { LeadsPage } from "../features/leads/LeadsPage";
import { LeadDetailPage } from "../features/leads/LeadDetailPage";
import { ConversationsPage } from "../features/conversations/ConversationsPage";
import { ReviewPage } from "../features/review/ReviewPage";
import { FollowUpsPage } from "../features/followups/FollowUpsPage";
import { ActivityLogPage } from "../features/activity-log/ActivityLogPage";
import { TeamPage } from "../features/team/TeamPage";
import { KnowledgeBasePage } from "../features/knowledge-base/KnowledgeBasePage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { PipelinePage } from "../features/pipeline/PipelinePage";
import { CustomersPage } from "../features/customers/CustomersPage";
import { CampaignsPage } from "../features/campaigns/CampaignsPage";
import { CampaignDetailPage } from "../features/campaigns/CampaignDetailPage";
import { ReportsPage } from "../features/reports/ReportsPage";

/**
 * Tauri'nin webview'ında dosya tabanlı history yerine hash router kullanılır
 * (üretim build'inde `file://` kökeninden servis edilir). RouteGuard, oturum ve
 * workspace üyeliği durumuna göre login/invite-pending/asıl uygulama arasında
 * yönlendirir; sidebar yalnızca asıl uygulama sayfalarını sarar.
 */
export const router = createHashRouter([
  {
    element: <RouteGuard />,
    errorElement: <RouteError />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/reset-password", element: <ResetPasswordPage /> },
      { path: "/set-password", element: <SetPasswordPage /> },
      { path: "/invite-pending", element: <InvitePendingPage /> },
      {
        element: <AppLayout />,
        children: [
          { path: "/", element: <DashboardPage /> },
          { path: "/discover", element: <DiscoverPage /> },
          { path: "/leads", element: <LeadsPage /> },
          { path: "/leads/:businessId", element: <LeadDetailPage /> },
          { path: "/conversations", element: <ConversationsPage /> },
          { path: "/review", element: <ReviewPage /> },
          { path: "/follow-ups", element: <FollowUpsPage /> },
          { path: "/pipeline", element: <PipelinePage /> },
          { path: "/customers", element: <CustomersPage /> },
          { path: "/campaigns", element: <CampaignsPage /> },
          { path: "/campaigns/:campaignId", element: <CampaignDetailPage /> },
          { path: "/reports", element: <ReportsPage /> },
          { path: "/activity-log", element: <ActivityLogPage /> },
          { path: "/team", element: <TeamPage /> },
          { path: "/knowledge-base", element: <KnowledgeBasePage /> },
          { path: "/settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
]);
