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
    save: "Kaydet",
    cancel: "İptal",
    loading: "Yükleniyor…",
  },
  auth: {
    loadingSession: "Oturum kontrol ediliyor…",
    loginTitle: "Giriş yap",
    email: "E-posta",
    password: "Şifre",
    loginButton: "Giriş yap",
    forgotPassword: "Şifremi unuttum",
    loginError: "E-posta veya şifre hatalı.",
    resetTitle: "Şifre sıfırlama",
    resetDescription: "E-posta adresinize şifre sıfırlama linki gönderilecek.",
    resetButton: "Sıfırlama linki gönder",
    resetSent: "E-posta gönderildi. Gelen kutunuzu kontrol edin.",
    backToLogin: "Girişe dön",
    invitePendingTitle: "Davet bekleniyor",
    invitePendingDescription:
      "Henüz bir workspace'e üye değilsiniz. Bir davet kodunuz varsa aşağıya girin, ya da ilk kurulum yapıyorsanız yeni bir workspace oluşturun.",
    inviteCodeLabel: "Davet kodu",
    acceptInviteButton: "Daveti kabul et",
    acceptInviteError: "Davet kodu geçersiz veya süresi dolmuş.",
    bootstrapTitle: "İlk kurulum",
    workspaceNameLabel: "Workspace adı",
    bootstrapButton: "Workspace oluştur",
    bootstrapError: "Workspace zaten mevcut; lütfen davet kodunuzu kullanın.",
    signOut: "Çıkış yap",
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
