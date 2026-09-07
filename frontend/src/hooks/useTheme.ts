import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settings-store";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * 把 settings-store 的 theme 应用到 <html>:
 * - dark: 加 `.dark` class, 移除 data-theme
 * - sepia / green: 设 `data-theme`, 移除 `.dark`(羊皮纸/护眼绿是浅色系主题)
 * - light / system: 清除 data-theme, `.dark` 由 matchMedia 决定; system 跟随系统实时切换
 *
 * 在 App 顶层调用一次即可(全局生效, Radix Portal 浮层挂在 body 也能继承 token).
 * 阅读器如需临时覆盖颜色, 应写 documentElement.style 内联 CSS 变量, 本 hook 不碰内联 style.
 */
export function useTheme(): void {
  const theme = useSettingsStore((state) => state.theme);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia(DARK_QUERY);

    const apply = (systemDark: boolean): void => {
      root.classList.toggle("dark", theme === "dark" || (theme === "system" && systemDark));
      if (theme === "sepia" || theme === "green") {
        root.setAttribute("data-theme", theme);
      } else {
        root.removeAttribute("data-theme");
      }
    };

    apply(media.matches);

    if (theme !== "system") {
      return;
    }
    const onChange = (event: MediaQueryListEvent): void => {
      apply(event.matches);
    };
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, [theme]);
}
