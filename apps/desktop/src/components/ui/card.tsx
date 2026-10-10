import type * as React from "react";
import { cn } from "../../lib/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-surface shadow-card", className)} {...props} />;
}

interface CardHeaderProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  /** Başlığın altında tek cümlelik açıklama (analiz kutularında kutunun ne gösterdiği). */
  description?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, icon, action, description, className }: CardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
          {icon}
          {title}
        </h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-4", className)} {...props} />;
}

export function CardLink({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn("shrink-0 text-xs font-medium whitespace-nowrap text-primary hover:text-primary-hover hover:underline", className)}
      {...props}
    />
  );
}
