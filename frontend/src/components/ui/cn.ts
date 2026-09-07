import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并 class: clsx 处理条件与数组, tailwind-merge 解决 Tailwind 工具类冲突(后写入的优先). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
