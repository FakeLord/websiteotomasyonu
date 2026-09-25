/**
 * Kullanıcıya görünen tüm metinler bu dosyada durur (CLAUDE.md → Kodlama standartları).
 */
export const tr = {
  app: {
    name: "Local Business Finder",
  },
  nav: {
    dashboard: "Dashboard",
    discover: "Discover",
    leads: "Leads",
    conversations: "Conversations",
    followUps: "Follow-Ups",
    activityLog: "Activity Log",
    team: "Team",
    knowledgeBase: "Knowledge Base",
    settings: "Settings",
  },
  common: {
    comingSoon: "Yakında",
    comingSoonDescription: "Bu sayfa henüz geliştirme aşamasında.",
  },
  status: {
    offline: "Çevrimdışısınız. Bağlantı kurulduğunda veriler otomatik senkronize edilecek.",
    offlineRetry: "Yeniden dene",
  },
  errorBoundary: {
    title: "Beklenmeyen bir hata oluştu",
    description: "Uygulama bir sorunla karşılaştı. Yeniden başlatmayı deneyin.",
    reload: "Yeniden yükle",
  },
} as const;

export type TrDictionary = typeof tr;
