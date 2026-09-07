import { useLayoutEffect } from "react";

import { useSettingsStore, type FontFamilyMode } from "@/stores/settings-store";

/** 衬线字体栈 (阅读设置: 字体-宋体) */
export const SERIF_FONT_STACK =
  'Georgia, "Times New Roman", "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", serif';
/** 无衬线字体栈: 与全局 body 字体一致 (阅读设置: 字体-黑体) */
export const SANS_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
/** 楷体字体栈 (阅读设置: 字体-楷体) */
export const KAI_FONT_STACK = '"Kaiti SC", "STKaiti", KaiTi, "Noto Kaiti SC", serif';

const READER_VARS = [
  "--reader-font-size",
  "--reader-line-height",
  "--reader-paragraph-gap",
  "--reader-content-width",
  "--reader-font-family",
] as const;

/**
 * 字体模式 → CSS font-family 串:
 * custom 用读者自填的 font-family 原串 (可含引号与回退), 空串回退衬线.
 */
export function resolveReaderFontFamily(
  fontFamily: FontFamilyMode,
  customFontFamily: string,
): string {
  switch (fontFamily) {
    case "serif":
      return SERIF_FONT_STACK;
    case "kai":
      return KAI_FONT_STACK;
    case "custom": {
      const custom = customFontFamily.trim();
      return custom === "" ? SERIF_FONT_STACK : custom;
    }
    case "sans":
      return SANS_FONT_STACK;
  }
}

/**
 * 把阅读排版设置落到 <html> 的内联 CSS 变量, 正文/工具栏/抽屉浮层统一消费.
 * 主题颜色 (.dark / data-theme) 由 App 层 useTheme 依据 settings-store.theme 写入 <html>,
 * 这里只写 --reader-* 内联变量, 卸载时清理, 避免影响其他页面.
 */
export function useReaderTheme(): void {
  const fontSize = useSettingsStore((state) => state.fontSize);
  const lineHeight = useSettingsStore((state) => state.lineHeight);
  const paragraphGap = useSettingsStore((state) => state.paragraphGap);
  const contentWidth = useSettingsStore((state) => state.contentWidth);
  const fontFamily = useSettingsStore((state) => state.fontFamily);
  const customFontFamily = useSettingsStore((state) => state.customFontFamily);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--reader-font-size", `${fontSize}px`);
    root.style.setProperty("--reader-line-height", String(lineHeight));
    root.style.setProperty("--reader-paragraph-gap", `${paragraphGap}em`);
    root.style.setProperty("--reader-content-width", `${contentWidth}em`);
    root.style.setProperty(
      "--reader-font-family",
      resolveReaderFontFamily(fontFamily, customFontFamily),
    );
    return () => {
      for (const name of READER_VARS) {
        root.style.removeProperty(name);
      }
    };
  }, [fontSize, lineHeight, paragraphGap, contentWidth, fontFamily, customFontFamily]);
}
