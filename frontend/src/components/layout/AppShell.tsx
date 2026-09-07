import { useState } from "react";
import { Outlet } from "react-router-dom";

import { SideNav, SideNavContent } from "./SideNav";
import { TopBar } from "./TopBar";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui";
import { getJSON, setJSON } from "@/lib/storage";

const NAV_COLLAPSED_KEY = "reader.navCollapsed";

/**
 * 应用主壳(已登录路由的布局路由):
 * - 桌面(>=md): 侧边导航(可折叠) + 顶栏 + 内容区
 * - 移动端(<md): 顶栏 + 内容区, 汉堡按钮打开 slide-over 侧栏(无底部导航)
 *
 * /reader 不经过本壳(沉浸式全屏, 自行管理布局).
 */
export default function AppShell() {
  const [collapsed, setCollapsed] = useState<boolean>(
    () => getJSON<boolean>(NAV_COLLAPSED_KEY) ?? false,
  );
  const [navOpen, setNavOpen] = useState(false);

  const toggleCollapsed = (): void => {
    const next = !collapsed;
    setCollapsed(next);
    setJSON(NAV_COLLAPSED_KEY, next);
  };

  return (
    <div className="flex h-full min-h-0 bg-background text-foreground">
      <SideNav collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenNav={() => setNavOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      {/* 移动端 slide-over 侧栏: fixed 面板 + 遮罩, 点完导航项即收起 */}
      <Drawer side="left" open={navOpen} onOpenChange={setNavOpen}>
        <DrawerContent className="w-64 md:w-64">
          <DrawerTitle className="sr-only">主导航</DrawerTitle>
          <SideNavContent collapsed={false} onNavigate={() => setNavOpen(false)} />
        </DrawerContent>
      </Drawer>
    </div>
  );
}
