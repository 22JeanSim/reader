import * as React from "react";

import { Button, type ButtonProps } from "./Button";
import { cn } from "./cn";
import { Tooltip, type TooltipSide } from "./Tooltip";

export type IconButtonSize = "sm" | "md" | "lg";

export interface IconButtonProps extends Omit<ButtonProps, "size"> {
  /** 正方形边长档位, 默认 md(36px) */
  size?: IconButtonSize;
  /** 悬浮提示; 提供时自动包一层 Tooltip, 文本形式的 tooltip 还能兜底 aria-label */
  tooltip?: React.ReactNode;
  /** 提示方向, 默认 top */
  tooltipSide?: TooltipSide;
}

const sizeClass: Record<IconButtonSize, string> = {
  sm: "size-8 [&_svg]:size-3.5",
  md: "size-9",
  lg: "size-10 rounded-xl [&_svg]:size-5",
};

/** 正方形图标按钮: children 放图标, 无障碍名称取 aria-label(缺失时用文本 tooltip 兜底). */
export function IconButton({
  size = "md",
  tooltip,
  tooltipSide = "top",
  className,
  children,
  ...props
}: IconButtonProps) {
  const label = props["aria-label"] ?? (typeof tooltip === "string" ? tooltip : undefined);

  const button = (
    <Button
      size="icon"
      aria-label={label}
      className={cn(sizeClass[size], className)}
      {...props}
    >
      {children}
    </Button>
  );

  if (tooltip == null) return button;

  return (
    <Tooltip content={tooltip} side={tooltipSide}>
      {button}
    </Tooltip>
  );
}
