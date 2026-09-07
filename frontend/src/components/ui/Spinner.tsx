import { LoaderCircle } from "lucide-react";
import * as React from "react";

import { cn } from "./cn";

import "./motion.css";

export type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps extends React.ComponentProps<"span"> {
  /** 直径档位, 默认 md(16px) */
  size?: SpinnerSize;
  /** 无障碍标签, 默认 "加载中" */
  label?: string;
}

const sizeClass: Record<SpinnerSize, string> = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-6",
};

/** 加载指示器: 旋转的圆环, 颜色继承父级 text-*, 700ms 一圈让等待感觉更短. */
export function Spinner({ size = "md", label = "加载中", className, ...props }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      {...props}
    >
      <LoaderCircle aria-hidden className={cn("ui-spin", sizeClass[size])} />
    </span>
  );
}
