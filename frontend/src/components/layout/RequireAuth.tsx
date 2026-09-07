import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { loginRedirect, resolveRedirect } from "@/hooks/useAuth";
import { useAuthStore } from "@/stores/auth-store";

interface RouteGuardProps {
  children: ReactElement;
}

/** 登录守卫: 未认证访问受保护路由 → /login?redirect={原路径} */
export function RequireAuth({ children }: RouteGuardProps): ReactElement {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to={loginRedirect(location.pathname, location.search)} replace />;
  }
  return children;
}

/** 访客专属守卫: 已登录用户访问 /login → 回到 redirect 目标或 "/" */
export function GuestOnly({ children }: RouteGuardProps): ReactElement {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const location = useLocation();
  if (isAuthenticated) {
    const redirect = resolveRedirect(new URLSearchParams(location.search).get("redirect"));
    return <Navigate to={redirect} replace />;
  }
  return children;
}
