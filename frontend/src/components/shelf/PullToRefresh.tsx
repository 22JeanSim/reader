import { ChevronDown } from "lucide-react";
import * as React from "react";

import { Spinner, cn } from "@/components/ui";

/** 手指位移 → 内容位移的阻尼系数 */
const RESISTANCE = 0.45;
/** 内容最大下拉位移 */
const MAX_PULL = 72;
/** 触发刷新的手指位移阈值 */
const TRIGGER_DELTA = 64;
/** 刷新进行中保留的位移, 让指示器停在可见位置 */
const REFRESH_HOLD = 36;

type PullStatus = "idle" | "pulling" | "ready" | "refreshing";

export interface PullToRefreshProps {
  /** 释放后执行, 返回的 Promise 结束即收起指示器 */
  onRefresh: () => Promise<void> | void;
  /** 编辑模式等场景下禁用手势 */
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}

/** 向上找第一个可滚动的祖先; 找不到就是文档滚动 */
function findScrollParent(node: HTMLElement | null): HTMLElement | Window {
  let current = node?.parentElement ?? null;
  while (current !== null) {
    const { overflowY } = window.getComputedStyle(current);
    const scrollable = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
    if (scrollable && current.scrollHeight > current.clientHeight) return current;
    current = current.parentElement;
  }
  return window;
}

/**
 * 移动端下拉刷新: 只在滚动容器位于顶部时接管手势.
 * React 的 touchmove 是被动监听(无法 preventDefault), 所以挂载期间用 overscroll-behavior
 * 关掉浏览器自身的下拉刷新, 卸载时还原.
 */
export function PullToRefresh({
  onRefresh,
  disabled = false,
  children,
  className,
}: PullToRefreshProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const startY = React.useRef<number | null>(null);
  const [pull, setPull] = React.useState(0);
  const [status, setStatus] = React.useState<PullStatus>("idle");
  const [snapping, setSnapping] = React.useState(true);

  React.useEffect(() => {
    if (disabled) return;
    const root = document.documentElement;
    const previous = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "contain";
    return () => {
      root.style.overscrollBehaviorY = previous;
    };
  }, [disabled]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (disabled || status === "refreshing") return;
    const scroller = findScrollParent(rootRef.current);
    const scrollTop = scroller instanceof HTMLElement ? scroller.scrollTop : scroller.scrollY;
    if (scrollTop > 0) return;
    const touch = event.touches[0];
    startY.current = touch ? touch.clientY : null;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = startY.current;
    if (disabled || start === null) return;
    const touch = event.touches[0];
    if (!touch) return;

    const delta = touch.clientY - start;
    if (delta <= 0) return;

    setSnapping(false);
    setPull(Math.min(delta * RESISTANCE, MAX_PULL));
    setStatus(delta >= TRIGGER_DELTA ? "ready" : "pulling");
  };

  const handleTouchEnd = () => {
    if (startY.current === null) return;
    startY.current = null;
    setSnapping(true);

    if (status !== "ready") {
      setPull(0);
      setStatus("idle");
      return;
    }

    setStatus("refreshing");
    setPull(REFRESH_HOLD);
    void Promise.resolve(onRefresh()).finally(() => {
      setPull(0);
      setStatus("idle");
    });
  };

  const handleTouchCancel = () => {
    startY.current = null;
    setSnapping(true);
    setPull(0);
    setStatus("idle");
  };

  return (
    <div
      ref={rootRef}
      className={cn("relative", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 flex items-end justify-center overflow-hidden"
        style={{ height: pull }}
      >
        {pull > 0 ? (
          <span className="flex items-center gap-1.5 pb-1.5 text-xs text-muted-foreground">
            {status === "refreshing" ? (
              <>
                <Spinner size="sm" label="刷新书架" />
                正在刷新书架
              </>
            ) : (
              <>
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "size-3.5 transition-transform duration-150",
                    status === "ready" && "rotate-180",
                  )}
                />
                {status === "ready" ? "释放立即刷新" : "下拉刷新书架"}
              </>
            )}
          </span>
        ) : null}
      </div>

      <div
        style={{
          transform: `translateY(${pull}px)`,
          transition: snapping ? "transform 200ms ease-out" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
