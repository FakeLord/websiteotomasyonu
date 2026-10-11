import { tr } from "../../i18n/tr";
import { PageHeader } from "../../components/ui/data-display";
import { ChangePasswordCard, ProfileCard } from "../settings/OtherSections";

/** "Profilim": ad soyadı düzenleme ve şifre değiştirme (kullanıcı menüsünden açılır). */
export function ProfilePage() {
  return (
    <div className="space-y-5">
      <PageHeader title={tr.profilePage.title} description={tr.profilePage.description} />
      <div className="grid gap-4 xl:grid-cols-2">
        <ProfileCard />
        <ChangePasswordCard />
      </div>
    </div>
  );
}
