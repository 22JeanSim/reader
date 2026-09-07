import type { ReactNode } from "react";

import { cn } from "./cn";

export interface PageIntroProps {
  /** 大写英文小标, 如 "SOURCE CENTER" */
  eyebrow: string;
  /** 衬线主标题 */
  title: string;
  /** 补充描述, 可选 */
  desc?: string;
  /** 右侧操作区(按钮等), lg 起与标题底部对齐 */
  action?: ReactNode;
  className?: string;
}

/** 页首标题区(移植自砚台原型): eyebrow + 衬线大标题 + 描述 + 右侧动作, 底部分隔线. */
export function PageIntro({ eyebrow, title, desc, action, className }: PageIntroProps) {
  return (
    <section
      className={cn(
        "mb-8 flex flex-col justify-between gap-5 border-b border-border/70 pb-7 lg:flex-row lg:items-end",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium tracking-[0.2em] text-accent uppercase">
          {eyebrow}
        </p>
        <h2 className="font-display text-3xl font-semibold tracking-wide text-balance sm:text-4xl">
          {title}
        </h2>
        {desc ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{desc}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </section>
  );
}
