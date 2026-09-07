import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";

import { cn } from "./cn";

import "./motion.css";

export type TooltipSide = "top" | "right" | "bottom" | "left";

export type TooltipProviderProps = React.ComponentProps<typeof TooltipPrimitive.Provider>;
export type TooltipRootProps = React.ComponentProps<typeof TooltipPrimitive.Root>;
export type TooltipTriggerProps = React.ComponentProps<typeof TooltipPrimitive.Trigger>;

export interface TooltipContentProps
  extends React.ComponentProps<typeof TooltipPrimitive.Content> {
  side?: TooltipSide;
}

/** Tooltip 上下文 Provider: Tooltip 内部已自动挂载, 仅当需要在一组 tooltip 之间共享跳过延迟时单独使用. */
export function TooltipProvider({
  delayDuration = 250,
  skipDelayDuration = 150,
  ...props
}: TooltipProviderProps) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  );
}

/** Tooltip 根节点(受控/非受控 open 与 onOpenChange), 需自行搭配 TooltipTrigger + TooltipContent. */
export const TooltipRoot = TooltipPrimitive.Root;

/** Tooltip 触发器, 默认 asChild 由调用方决定. */
export const TooltipTrigger = TooltipPrimitive.Trigger;

/** Tooltip 浮层: 反色胶囊(foreground 底 + background 字), 深浅色与阅读主题自动适配. */
export function TooltipContent({ className, sideOffset = 6, ...props }: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "ui-tooltip ui-anchor z-100 max-w-60 rounded-lg bg-foreground px-2 py-1 text-xs leading-5 text-background shadow-md",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

export interface TooltipProps extends TooltipRootProps {
  /** 提示内容 */
  content: React.ReactNode;
  /** 浮层方向, 默认 top */
  side?: TooltipSide;
  /** 触发元素(单个元素时自动 asChild, 不额外包 button) */
  children: React.ReactNode;
  /** 追加到浮层的 class */
  contentClassName?: string;
}

/** 悬浮提示: 自带 Provider, 用法 `<Tooltip content="目录"><IconButton …/></Tooltip>`. */
export function Tooltip({
  content,
  side = "top",
  children,
  contentClassName,
  ...props
}: TooltipProps) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root {...props}>
        <TooltipPrimitive.Trigger asChild={React.isValidElement(children)}>
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipContent side={side} className={contentClassName}>
          {content}
        </TooltipContent>
      </TooltipPrimitive.Root>
    </TooltipProvider>
  );
}
