import type * as React from "react";
import { Mail, MessageCircle, Music2, Phone } from "lucide-react";
import { cn } from "../../lib/cn";

type SvgProps = React.SVGProps<SVGSVGElement>;

function InstagramGlyph(props: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

function FacebookGlyph(props: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v6h4v-6h3l.5-4h-3.5V8.8c0-.5.3-.8.5-.8Z" />
    </svg>
  );
}

function LinkedinGlyph(props: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M5 9h3v11H5V9Zm1.5-5a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5ZM10 9h2.9v1.5c.5-.9 1.7-1.8 3.4-1.8 3.2 0 3.7 2.1 3.7 4.8V20h-3v-5.8c0-1.4 0-3.1-1.9-3.1s-2.2 1.5-2.2 3V20H10V9Z" />
    </svg>
  );
}

export type ChannelKey = "EMAIL" | "INSTAGRAM" | "FACEBOOK" | "WHATSAPP" | "LINKEDIN" | "TIKTOK" | "PHONE" | "WEBSITE";

const CHANNELS: Record<ChannelKey, { color: string; Icon: React.ComponentType<SvgProps> }> = {
  EMAIL: { color: "#f59e0b", Icon: Mail },
  INSTAGRAM: { color: "#ec4899", Icon: InstagramGlyph },
  FACEBOOK: { color: "#3b82f6", Icon: FacebookGlyph },
  WHATSAPP: { color: "#22c55e", Icon: MessageCircle },
  LINKEDIN: { color: "#0ea5e9", Icon: LinkedinGlyph },
  TIKTOK: { color: "#e7ebf6", Icon: Music2 },
  PHONE: { color: "#8b5cf6", Icon: Phone },
  WEBSITE: { color: "#06b6d4", Icon: Mail },
};

export function channelColor(channel: string): string {
  return CHANNELS[channel as ChannelKey]?.color ?? "#8b95b4";
}

interface ChannelIconProps {
  channel: string;
  boxed?: boolean;
  className?: string;
}

/** Kanal ikonu; `boxed` iken görseldeki renkli kare zeminle gösterilir. */
export function ChannelIcon({ channel, boxed = false, className }: ChannelIconProps) {
  const entry = CHANNELS[channel as ChannelKey] ?? CHANNELS.EMAIL;
  const { Icon, color } = entry;
  if (!boxed) {
    return <Icon className={cn("size-4 shrink-0", className)} style={{ color }} aria-hidden />;
  }
  return (
    <span
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg", className)}
      style={{ backgroundColor: `${color}22`, color }}
      aria-hidden
    >
      <Icon className="size-4" />
    </span>
  );
}
