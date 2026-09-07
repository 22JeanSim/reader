import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "./cn";
import { IconButton } from "./IconButton";

import "./motion.css";

export type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root>;
export type DialogTriggerProps = React.ComponentProps<typeof DialogPrimitive.Trigger>;
export type DialogCloseProps = React.ComponentProps<typeof DialogPrimitive.Close>;
export type DialogOverlayProps = React.ComponentProps<typeof DialogPrimitive.Overlay>;
export type DialogTitleProps = React.ComponentProps<typeof DialogPrimitive.Title>;
export type DialogDescriptionProps = React.ComponentProps<typeof DialogPrimitive.Description>;

/** 对话框根节点: open / onOpenChange 控制显隐, 默认 modal(遮罩 + 焦点陷阱 + Esc 关闭). */
export const Dialog = DialogPrimitive.Root;

/** 对话框触发器, 常配 asChild 使用. */
export const DialogTrigger = DialogPrimitive.Trigger;

/** 关闭对话框(渲染在 Content 内部), 常配 asChild 包住取消按钮. */
export const DialogClose = DialogPrimitive.Close;

/** 对话框标题: 与 Radix 的无障碍标题绑定, 每个 Content 必须有且仅有一个. */
export function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <DialogPrimitive.Title
      className={cn("text-base leading-6 font-semibold text-foreground", className)}
      {...props}
    />
  );
}

/** 对话框描述: 补充说明文本, 可选. */
export function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm leading-5 text-muted-foreground", className)}
      {...props}
    />
  );
}

/** 半透明遮罩: 淡入淡出, 点击遮罩关闭由 Radix 处理. */
export function DialogOverlay({ className, ...props }: DialogOverlayProps) {
  return (
    <DialogPrimitive.Overlay
      className={cn("ui-overlay fixed inset-0 z-50 bg-black/40", className)}
      {...props}
    />
  );
}

export type DialogWidth = "sm" | "md" | "lg" | "xl";

export interface DialogContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Content> {
  /** md 以上的面板宽度档位, 默认 md(28rem) */
  width?: DialogWidth;
  /** 隐藏右上角关闭按钮, 默认 false */
  hideClose?: boolean;
}

const widthClass: Record<DialogWidth, string> = {
  sm: "md:max-w-sm",
  md: "md:max-w-md",
  lg: "md:max-w-lg",
  xl: "md:max-w-2xl",
};

/** 对话框面板: md 以下全屏, md 以上居中卡片(圆角 + 边框 + 阴影). */
export function DialogContent({
  width = "md",
  hideClose = false,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <div className="fixed inset-0 z-50 flex flex-col justify-end overflow-y-auto md:items-center md:justify-center md:p-4">
        <DialogPrimitive.Content
          className={cn(
            "ui-dialog relative flex h-full w-full flex-col overflow-y-auto bg-surface text-foreground shadow-2xl outline-none md:h-auto md:max-h-full md:w-auto md:min-w-80 md:rounded-xl md:border md:shadow-2xl",
            widthClass[width],
            className,
          )}
          {...props}
        >
          {children}
          {hideClose ? null : (
            <DialogPrimitive.Close asChild>
              <IconButton
                variant="ghost"
                size="sm"
                aria-label="关闭"
                className="absolute top-2 right-2"
              >
                <X />
              </IconButton>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
}

export type DialogHeaderProps = React.ComponentProps<"div">;

/** 对话框头部: 标题 + 描述的纵向容器, 右侧留出关闭按钮位置. */
export function DialogHeader({ className, ...props }: DialogHeaderProps) {
  return (
    <div
      className={cn("flex shrink-0 flex-col gap-1.5 p-4 pr-12 md:p-5 md:pr-14", className)}
      {...props}
    />
  );
}

export type DialogFooterProps = React.ComponentProps<"div">;

/** 对话框底部操作区: 移动端纵向堆叠(主操作在上, 贴合动作面板习惯), md 以上右对齐横排. */
export function DialogFooter({ className, ...props }: DialogFooterProps) {
  return (
    <div
      className={cn(
        "mt-auto flex shrink-0 flex-col-reverse gap-2 p-4 pt-2 md:flex-row md:justify-end md:p-5 md:pt-2",
        className,
      )}
      {...props}
    />
  );
}
