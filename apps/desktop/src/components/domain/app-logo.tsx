import { cn } from "../../lib/cn";

/** Uygulama işareti: harita iğnesi içinde büyüteç — "yerel işletme bul". */
export function AppLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet shadow-lg shadow-primary/30",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-5 text-white" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Z" strokeLinejoin="round" />
        <circle cx="12" cy="10" r="2.6" />
      </svg>
    </span>
  );
}
