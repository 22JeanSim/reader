import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "./cn";
import { DialogOverlay } from "./Dialog";
import { IconButton } from "./IconButton";

import "./motion.css";

export type DrawerSide = "left" | "right" | "bottom";

export type DrawerProps = React.ComponentProps<typeof DialogPrimitive.Root> & {
  /** 滑入方向, 默认 left(目录抽屉) */
  side?: DrawerSide;
  /** md 以下自动降级为底部抽屉(移动端更贴合手势习惯), 默认 false */
  sheetOnMobile?: boolean;
};

export type DrawerTriggerProps = React.ComponentProps<typeof DialogPrimitive.Trigger>;
export type DrawerCloseProps = React.ComponentProps<typeof DialogPrimitive.Close>;
export type DrawerTitleProps = React.ComponentProps<typeof DialogPrimitive.Title>;
export type DrawerDescriptionProps = React.ComponentProps<typeof DialogPrimitive.Description>;

interface DrawerPlacement {
  side: DrawerSide;
  sheetOnMobile: boolean;
}

const DrawerPlacementContext = React.createContext<DrawerPlacement>({
  side: "left",
  sheetOnMobile: false,
});

/** 抽屉根节点: Radix Dialog 的侧滑变体, side 决定滑入方向, 由 Content 消费. */
export function Drawer({ side = "left", sheetOnMobile = false, ...props }: DrawerProps) {
  const placement = React.useMemo(() => ({ side, sheetOnMobile }), [side, sheetOnMobile]);
  return (
    <DrawerPlacementContext.Provider value={placement}>
      <DialogPrimitive.Root {...props} />
    </DrawerPlacementContext.Provider>
  );
}

/** 抽屉触发器, 常配 asChild 使用. */
export const DrawerTrigger = DialogPrimitive.Trigger;

/** 关闭抽屉(渲染在 Content 内部), 常配 asChild 包住按钮. */
export const DrawerClose = DialogPrimitive.Close;

/** 抽屉标题: 与 Radix 的无障碍标题绑定. */
export function DrawerTitle({ className, ...props }: DrawerTitleProps) {
  return (
    <DialogPrimitive.Title
      className={cn("text-base leading-6 font-semibold text-foreground", className)}
      {...props}
    />
  );
}

/** 抽屉描述: 补充说明文本, 可选. */
export function DrawerDescription({ className, ...props }: DrawerDescriptionProps) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm leading-5 text-muted-foreground", className)}
      {...props}
    />
  );
}

/* 面板定位: 左右抽屉占满高度, 底部抽屉按内容高度并限制在 80% 视口内 */
const sidePanelClass: Record<DrawerSide, string> = {
  left: "ui-drawer-left inset-y-0 left-0 h-full w-72 rounded-r-xl border-r md:w-80",
  right: "ui-drawer-right inset-y-0 right-0 h-full w-72 rounded-l-xl border-l md:w-80",
  bottom: "ui-drawer-bottom inset-x-0 bottom-0 max-h-4/5 w-full rounded-t-2xl border-t",
};

const sheetPanelClass: Record<Exclude<DrawerSide, "bottom">, string> = {
  left: cn(
    "ui-drawer-sheet inset-x-0 bottom-0 max-h-4/5 w-full rounded-t-2xl border-t",
    "md:top-0 md:bottom-0 md:left-0 md:right-auto md:h-full md:max-h-full md:w-80 md:rounded-t-none md:rounded-r-xl md:border-t-0 md:border-r",
  ),
  right: cn(
    "ui-drawer-sheet inset-x-0 bottom-0 max-h-4/5 w-full rounded-t-2xl border-t",
    "md:top-0 md:bottom-0 md:right-0 md:left-auto md:h-full md:max-h-full md:w-80 md:rounded-t-none md:rounded-l-xl md:border-t-0 md:border-l",
  ),
};

function panelClass(side: DrawerSide, sheetOnMobile: boolean): string {
  if (side === "bottom" || !sheetOnMobile) return sidePanelClass[side];
  return sheetPanelClass[side];
}

export interface DrawerContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Content> {
  /** 隐藏右上角关闭按钮, 默认 false */
  hideClose?: boolean;
}

/** 抽屉面板: 固定定位 + 滑入动效, 底部预留安全区; 长内容放进 DrawerBody 才能独立滚动. */
export function DrawerContent({
  hideClose = false,
  className,
  children,
  ...props
}: DrawerContentProps) {
  const { side, sheetOnMobile } = React.useContext(DrawerPlacementContext);

  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          "ui-safe-b ui-safe-x fixed z-50 flex flex-col overflow-hidden bg-surface text-foreground shadow-2xl outline-none",
          panelClass(side, sheetOnMobile),
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
    </DialogPrimitive.Portal>
  );
}

export type DrawerHeaderProps = React.ComponentProps<"div">;

/** 抽屉头部: 标题 + 描述的纵向容器, 右侧留出关闭按钮位置. */
export function DrawerHeader({ className, ...props }: DrawerHeaderProps) {
  return (
    <div
      className={cn("flex shrink-0 flex-col gap-1 border-b border-border p-4 pr-12", className)}
      {...props}
    />
  );
}

export type DrawerBodyProps = React.ComponentProps<"div">;

/** 抽屉滚动区: 占满剩余高度, 目录/章节列表放这里. */
export function DrawerBody({ className, ...props }: DrawerBodyProps) {
  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain p-2", className)}
      {...props}
    />
  );
}

export type DrawerFooterProps = React.ComponentProps<"div">;

/** 抽屉底部操作区: 固定在面板底部, 上边框分隔. */
export function DrawerFooter({ className, ...props }: DrawerFooterProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-t border-border p-3",
        className,
      )}
      {...props}
    />
  );
}
