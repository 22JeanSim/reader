import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import * as React from "react";

import { cn } from "./cn";

import "./motion.css";

export type DropdownMenuProps = React.ComponentProps<typeof DropdownMenuPrimitive.Root>;
export type DropdownMenuTriggerProps = React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>;
export type DropdownMenuGroupProps = React.ComponentProps<typeof DropdownMenuPrimitive.Group>;
export type DropdownMenuRadioGroupProps = React.ComponentProps<
  typeof DropdownMenuPrimitive.RadioGroup
>;
export type DropdownMenuSubProps = React.ComponentProps<typeof DropdownMenuPrimitive.Sub>;
export type DropdownMenuContentProps = React.ComponentProps<typeof DropdownMenuPrimitive.Content>;
export type DropdownMenuLabelProps = React.ComponentProps<typeof DropdownMenuPrimitive.Label>;
export type DropdownMenuSeparatorProps = React.ComponentProps<
  typeof DropdownMenuPrimitive.Separator
>;
export type DropdownMenuSubContentProps = React.ComponentProps<
  typeof DropdownMenuPrimitive.SubContent
>;

/** 下拉菜单根节点: open / onOpenChange 控制, 方向键与 Esc 由 Radix 处理. */
export const DropdownMenu = DropdownMenuPrimitive.Root;

/** 下拉菜单触发器, 常配 asChild 包住 IconButton. */
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

/** 菜单分组(与 Label 搭配做分组标题). */
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;

/** 单选组: 配合 DropdownMenuRadioItem 使用. */
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

/** 子菜单根节点: 内含 SubTrigger + SubContent. */
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const panelClass =
  "ui-anchor z-100 min-w-40 overflow-hidden rounded-xl border border-border bg-surface p-1.5 text-foreground shadow-xl";

const itemClass =
  "relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none transition duration-150 ease-out data-[highlighted]:bg-surface-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

/** 菜单浮层: 从触发点缩放展开, 自动避让视口边缘. */
export function DropdownMenuContent({ className, sideOffset = 6, ...props }: DropdownMenuContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align="start"
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(panelClass, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export interface DropdownMenuItemProps
  extends React.ComponentProps<typeof DropdownMenuPrimitive.Item> {
  /** danger 档位用于删除类操作 */
  variant?: "default" | "danger";
  /** 左侧留出勾选位, 与 CheckboxItem/RadioItem 对齐 */
  inset?: boolean;
}

/** 菜单项: 悬浮/键盘高亮, 支持图标与快捷键文本, 禁用态自动降透明度. */
export function DropdownMenuItem({
  variant = "default",
  inset = false,
  className,
  ...props
}: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        itemClass,
        variant === "danger" && "text-danger [&_svg]:text-danger",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  );
}

const indicatorItemClass = cn(itemClass, "gap-0 pl-8");

/** 勾选型菜单项: 左侧显示 Check 图标, checked / onCheckedChange 受控. */
export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem className={cn(indicatorItemClass, className)} {...props}>
      <span className="absolute left-2.5 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

/** 单选型菜单项: 必须放在 DropdownMenuRadioGroup 内. */
export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem className={cn(indicatorItemClass, className)} {...props}>
      <span className="absolute left-2.5 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

/** 分组标题: 小字号弱化的说明文本. */
export function DropdownMenuLabel({ className, ...props }: DropdownMenuLabelProps) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn("px-2.5 py-1.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

/** 菜单分隔线. */
export function DropdownMenuSeparator({ className, ...props }: DropdownMenuSeparatorProps) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn("-mx-1.5 my-1.5 h-px bg-border", className)}
      {...props}
    />
  );
}

export type DropdownMenuShortcutProps = React.ComponentProps<"span">;

/** 快捷键提示: 靠右对齐的弱化文本. */
export function DropdownMenuShortcut({ className, ...props }: DropdownMenuShortcutProps) {
  return (
    <span
      className={cn("ml-auto pl-4 text-xs tracking-wide text-muted-foreground", className)}
      {...props}
    />
  );
}

/** 子菜单触发项: 右侧显示展开箭头, 展开时保持高亮. */
export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      className={cn(itemClass, "data-[state=open]:bg-surface-muted", className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

/** 子菜单浮层. */
export function DropdownMenuSubContent({ className, ...props }: DropdownMenuSubContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent className={cn(panelClass, className)} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
}
