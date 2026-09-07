import * as React from "react";

import { cn } from "./cn";

export type BadgeVariant = "default" | "accent" | "muted" | "danger" | "outline";
export type BadgeSize = "sm" | "md";

export interface BadgeProps extends React.ComponentProps<"span"> {
  /** 语义档位: accent=启用/成功, danger=失效/错误, muted=次要信息 */
  variant?: BadgeVariant;
  /** 内边距档位, 默认 md */
  size?: BadgeSize;
}

const variantClass: Record<BadgeVariant, string> = {
  default: "border border-border bg-surface-muted text-foreground",
  accent: "border border-accent/30 bg-accent/15 text-accent",
  muted: "bg-surface-muted text-muted-foreground",
  danger: "border border-danger/30 bg-danger/15 text-danger",
  outline: "border border-border text-muted-foreground",
};

const sizeClass: Record<BadgeSize, string> = {
  sm: "h-4.5 gap-1 rounded-md px-1.5 text-xs",
  md: "h-5.5 gap-1 rounded-lg px-2 text-xs",
};

/** 状态标签: 用于书源启用/失效、书籍类型、分组名等短文本标记. */
export function Badge({ variant = "default", size = "md", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  );
}
