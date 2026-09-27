import type * as React from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";
import { tr } from "../../i18n/tr";

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
      className={cn("border-b border-border px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-border/60 px-3 py-2.5 align-middle text-text", className)} {...props} />;
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-surface-2/60", className)} {...props} />;
}

/* Avatar */

const AVATAR_COLORS = ["#2f6bff", "#8b5cf6", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#ef4444"];

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
      style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }}
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
  color: string;
  delta?: number | null;
  className?: string;
  compact?: boolean;
}

export function StatCard({ label, value, icon: Icon, color, delta, className, compact = false }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex rounded-xl border border-border bg-surface",
        compact ? "flex-col gap-2 p-3" : "items-start gap-3 p-4",
        className,
      )}
    >
      <span
        className={cn("flex shrink-0 items-center justify-center rounded-lg", compact ? "size-8" : "size-10")}
        style={{ backgroundColor: `${color}22`, color }}
      >
        <Icon className={compact ? "size-4" : "size-5"} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tracking-tight text-text tabular-nums">{value}</p>
        {delta !== undefined && delta !== null && (
          <p className={cn("mt-0.5 text-xs font-medium", delta >= 0 ? "text-success" : "text-danger")}>
            {delta >= 0 ? "▲" : "▼"} %{Math.abs(delta).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
          </p>
        )}
      </div>
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
