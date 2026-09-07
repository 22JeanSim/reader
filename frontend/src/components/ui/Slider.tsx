import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";

import { cn } from "./cn";

export type SliderProps = React.ComponentProps<typeof SliderPrimitive.Root> & {
  /** 左侧说明文本(字号、行距、亮度等) */
  label?: React.ReactNode;
  /** 在右上角显示当前值, 默认 true */
  showValue?: boolean;
  /** 值的展示格式, 默认原样输出数字 */
  formatValue?: (value: number) => string;
};

/** 滑块: 阅读设置用, 上方一行显示说明与当前值; value 数组长度决定滑块个数. */
export function Slider({
  label,
  showValue = true,
  formatValue,
  className,
  value,
  defaultValue,
  onValueChange,
  disabled,
  ...props
}: SliderProps) {
  const [draft, setDraft] = React.useState<number[] | undefined>(undefined);
  const current = value ?? draft ?? defaultValue ?? [0];
  const format = formatValue ?? ((item: number) => String(item));
  const thumbLabel = typeof label === "string" ? label : undefined;

  const handleValueChange = (next: number[]) => {
    setDraft(next);
    onValueChange?.(next);
  };

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      {label != null || showValue ? (
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium text-foreground">{label}</span>
          {showValue ? (
            <span className="tabular-nums text-muted-foreground">
              {current.map(format).join(" · ")}
            </span>
          ) : null}
        </div>
      ) : null}
      <SliderPrimitive.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
        disabled={disabled}
        className={cn(
          "relative flex w-full touch-none select-none items-center",
          disabled && "pointer-events-none opacity-50",
        )}
        {...props}
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-surface-muted">
          <SliderPrimitive.Range className="absolute h-full bg-accent" />
        </SliderPrimitive.Track>
        {Array.from({ length: Math.max(1, current.length) }, (_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            aria-label={thumbLabel}
            className="block size-4 shrink-0 cursor-grab rounded-full border-2 border-accent bg-background shadow-sm outline-none transition-transform duration-150 ease-out hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent/60 active:cursor-grabbing disabled:pointer-events-none"
          />
        ))}
      </SliderPrimitive.Root>
    </div>
  );
}
