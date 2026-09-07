import * as React from "react";

import { cn } from "./cn";

type UnknownProps = Record<string, unknown>;

/** 组合多个 ref(回调 ref 与对象 ref 都支持), 返回 React 19 风格的 ref 回调. */
function composeRefs(...refs: Array<React.Ref<unknown> | undefined>): React.RefCallback<unknown> {
  return (node) => {
    let cleanup: (() => void) | undefined;
    for (const ref of refs) {
      if (typeof ref === "function") {
        const result = ref(node);
        if (typeof result === "function") cleanup = result;
      } else if (ref) {
        ref.current = node;
      }
    }
    return () => {
      cleanup?.();
      for (const ref of refs) {
        if (ref && typeof ref !== "function") ref.current = null;
      }
    };
  };
}

/** 把 Slot 的 props 合并进子元素 props: 事件链式触发, className 用 cn 合并, style/ref 组合, 其余以子元素为准. */
function mergeProps(slotProps: UnknownProps, childProps: UnknownProps): UnknownProps {
  const merged: UnknownProps = { ...slotProps, ...childProps };

  for (const key of Object.keys(slotProps)) {
    const slotValue = slotProps[key];
    const childValue = childProps[key];
    if (!key.startsWith("on") || typeof slotValue !== "function") continue;
    merged[key] =
      typeof childValue === "function"
        ? (...args: unknown[]) => {
            (slotValue as (...a: unknown[]) => void)(...args);
            (childValue as (...a: unknown[]) => void)(...args);
          }
        : slotValue;
  }

  if (typeof slotProps.className === "string" || typeof childProps.className === "string") {
    merged.className = cn(
      slotProps.className as string | undefined,
      childProps.className as string | undefined,
    );
  }

  if (slotProps.style != null || childProps.style != null) {
    merged.style = {
      ...(slotProps.style as React.CSSProperties | undefined),
      ...(childProps.style as React.CSSProperties | undefined),
    };
  }

  if (slotProps.ref != null || childProps.ref != null) {
    merged.ref = composeRefs(
      slotProps.ref as React.Ref<unknown> | undefined,
      childProps.ref as React.Ref<unknown> | undefined,
    );
  }

  return merged;
}

export interface SlotProps extends React.HTMLAttributes<HTMLElement>, UnknownProps {
  /** 唯一子元素, Slot 会把自己的 props 合并到它上面 */
  children?: React.ReactNode;
  ref?: React.Ref<HTMLElement>;
}

/**
 * asChild 载体: 不产生额外 DOM, 把自身 props 合并进唯一子元素.
 * 项目未直接依赖 @radix-ui/react-slot, 这里是等价的自实现.
 */
export function Slot({ children, ...props }: SlotProps) {
  const child = React.Children.only(children) as React.ReactElement<UnknownProps>;
  return React.cloneElement(child, mergeProps(props, (child.props ?? {}) as UnknownProps));
}
