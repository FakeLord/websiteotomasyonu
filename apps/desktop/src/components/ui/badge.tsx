import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

/**
 * Kurumsal rozet tonları: düz, açık zemin + koyu metin. Anlam: gray nötr, blue bilgi/etkin, navy kurumsal/otomasyon,
 * green olumlu, orange dikkat, red olumsuz/risk. Başka ton eklenmez.
 */
export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium [&_svg]:size-3",
  {
    variants: {
      tone: {
        gray: "bg-surface-3 text-muted",
        blue: "bg-primary/10 text-primary",
        navy: "bg-sidebar/10 text-sidebar",
        green: "bg-success/10 text-success",
        orange: "bg-warning/10 text-warning",
        red: "bg-danger/10 text-danger",
      },
    },
    defaultVariants: { tone: "gray" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function Dot({ tone = "gray" }: { tone?: BadgeTone }) {
  const colors: Record<BadgeTone, string> = {
    gray: "bg-subtle",
    blue: "bg-primary",
    navy: "bg-sidebar",
    green: "bg-success",
    orange: "bg-warning",
    red: "bg-danger",
  };
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", colors[tone])} />;
}
