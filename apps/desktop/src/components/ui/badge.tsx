import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium [&_svg]:size-3",
  {
    variants: {
      tone: {
        gray: "bg-surface-3 text-muted",
        blue: "bg-primary/15 text-[#6f9bff]",
        violet: "bg-violet/15 text-[#a78bfa]",
        green: "bg-success/15 text-[#4ade80]",
        orange: "bg-warning/15 text-[#fbbf24]",
        red: "bg-danger/15 text-[#f87171]",
        pink: "bg-pink/15 text-[#f472b6]",
        cyan: "bg-cyan/15 text-[#22d3ee]",
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
    violet: "bg-violet",
    green: "bg-success",
    orange: "bg-warning",
    red: "bg-danger",
    pink: "bg-pink",
    cyan: "bg-cyan",
  };
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", colors[tone])} />;
}
