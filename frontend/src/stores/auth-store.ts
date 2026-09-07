import { create } from "zustand";
import { clearAccessToken, getAccessToken, setAccessToken } from "@/lib/storage";
import type { LoginResult } from "@/types/api";

export interface AuthState {
  /** 格式 `username:token` */
  accessToken: string | null;
  username: string | null;
  isAuthenticated: boolean;
  /** 登录成功后写入内存 + localStorage */
  login: (result: LoginResult) => void;
  /** 清除登录态 */
  logout: () => void;
  /** 从 localStorage 恢复 (刷新页面/初始化) */
  restore: () => void;
}

type StoredAuth = Pick<AuthState, "accessToken" | "username" | "isAuthenticated">;

const ANONYMOUS: StoredAuth = {
  accessToken: null,
  username: null,
  isAuthenticated: false,
};

function readStoredAuth(): StoredAuth {
  const accessToken = getAccessToken();
  if (accessToken === null) {
    return ANONYMOUS;
  }
  // accessToken 形如 `username:token`, 冒号前为用户名
  const separator = accessToken.indexOf(":");
  const username = separator > 0 ? accessToken.slice(0, separator) : null;
  return { accessToken, username, isAuthenticated: true };
}

export const useAuthStore = create<AuthState>()((set) => ({
  ...readStoredAuth(),

  login: (result) => {
    setAccessToken(result.accessToken);
    set({
      accessToken: result.accessToken,
      username: result.username,
      isAuthenticated: true,
    });
  },

  logout: () => {
    clearAccessToken();
    set({ ...ANONYMOUS });
  },

  restore: () => {
    set(readStoredAuth());
  },
}));
