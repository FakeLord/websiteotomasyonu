import type * as React from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";
import { tr } from "../../i18n/tr";
import { AVATAR_COLORS } from "../../lib/theme-colors";

/* Table */

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("border-b border-border bg-surface-2 px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-border/60 px-3 py-2.5 align-middle text-text", className)} {...props} />;
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-surface-2", className)} {...props} />;
}

/* Avatar */



function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toLocaleUpperCase("tr-TR");
}

interface AvatarProps {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  square?: boolean;
  className?: string;
}

export function Avatar({ name, size = "md", square = false, className }: AvatarProps) {
  const sizes = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-9 text-xs", lg: "size-12 text-sm", xl: "size-20 text-xl" };
  const color = AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-semibold text-white",
        square ? "rounded-lg" : "rounded-full",
        sizes[size],
        className,
      )}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/* Stat card */

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  /** Önceki döneme göre yüzde değişim. */
  delta?: number | null;
  /** Kıyas açıklaması ("önceki döneme göre"). */
  deltaLabel?: string;
  /** Değerin altındaki kısa not (örn. "12 yeni bu hafta"). */
  hint?: string;
  /** Mini trend çizgisi için gün gün değerler. */
  trend?: number[];
  className?: string;
  compact?: boolean;
}

/** Küçük, eksen/etiket içermeyen trend çizgisi (kurumsal gösterge kutuları için). */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const width = 96;
  const height = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cn("h-8 w-full text-primary", className)} aria-hidden>
      <polyline points={points.join(" ")} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function StatCard({ label, value, icon: Icon, delta, deltaLabel, hint, trend, className, compact = false }: StatCardProps) {
  const hasDelta = delta !== undefined && delta !== null;
  return (
    <div className={cn("rounded-lg border border-border bg-surface shadow-card", compact ? "p-3" : "p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted">{label}</p>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-3 text-muted">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-text tabular-nums">{value}</p>
      {trend && <Sparkline values={trend} className="mt-2" />}
      {(hasDelta || hint) && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          {hasDelta && (
            <span className={cn("font-medium", delta >= 0 ? "text-success" : "text-danger")}>
              {delta >= 0 ? "▲" : "▼"} %{Math.abs(delta).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
            </span>
          )}
          {hasDelta && deltaLabel && <span>{deltaLabel}</span>}
          {hint && <span>{hint}</span>}
        </p>
      )}
    </div>
  );
}

/* Progress */

export function Progress({ value, color = "var(--color-primary)", className }: { value: number; color?: string; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className="h-full rounded-full" style={{ width: `${clamped}%`, backgroundColor: color }} />
    </div>
  );
}

/* Empty state */

export function EmptyState({ icon: Icon, title, description, action }: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium text-text">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* Pagination */

interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  total?: number;
}

export function Pagination({ page, pageCount, onPageChange, total }: PaginationProps) {
  if (pageCount <= 1 && total === undefined) return null;
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1,
  );
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3 text-xs text-muted">
      <span>{total !== undefined ? tr.common.totalRecords(total) : null}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="rounded-md p-1.5 hover:bg-surface-2 disabled:opacity-30"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={tr.common.previousPage}
        >
          <ChevronLeft className="size-4" />
        </button>
        {pages.map((p, index) => (
          <span key={p} className="flex items-center">
            {index > 0 && pages[index - 1] !== p - 1 && <span className="px-1">…</span>}
            <button
              type="button"
              onClick={() => onPageChange(p)}
              className={cn(
                "min-w-7 rounded-md px-2 py-1 tabular-nums",
                p === page ? "bg-primary text-white" : "hover:bg-surface-2",
              )}
            >
              {p}
            </button>
          </span>
        ))}
        <button
          type="button"
          className="rounded-md p-1.5 hover:bg-surface-2 disabled:opacity-30"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          aria-label={tr.common.nextPage}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

/* Page header */

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 text-right break-words text-text">{children}</span>
    </div>
  );
}
