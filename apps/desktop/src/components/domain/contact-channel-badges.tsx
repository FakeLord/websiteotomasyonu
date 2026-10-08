import { availableChannels, type ContactChannelRef } from "../../lib/contact-channels";
import { tr } from "../../i18n/tr";
import { ChannelIcon } from "./channel-icon";

interface ContactChannelBadgesProps {
  channels: ContactChannelRef[] | null | undefined;
}

/** İşletmeye hangi kanallardan ulaşılabildiğini ikonlarla gösterir (telefon, e-posta, WhatsApp, sosyal medya). */
export function ContactChannelBadges({ channels }: ContactChannelBadgesProps) {
  const found = availableChannels(channels);
  if (found.length === 0) {
    return <span className="text-xs text-subtle">{tr.contactChannels.none}</span>;
  }
  return (
    <span className="flex items-center gap-1.5" aria-label={tr.contactChannels.ariaLabel(found.map((c) => tr.channels[c as keyof typeof tr.channels] ?? c))}>
      {found.map((channel) => (
        <span key={channel} title={tr.channels[channel as keyof typeof tr.channels] ?? channel}>
          <ChannelIcon channel={channel} className="size-3.5" />
        </span>
      ))}
    </span>
  );
}
