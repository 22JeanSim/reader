/**
 * localStorage 读写封装. 所有 key 统一 `reader.` 前缀.
 * 浏览器隐私模式/禁用存储时 localStorage 访问会抛异常, 这里统一降级为 null.
 */

export const ACCESS_TOKEN_KEY = "reader.accessToken";
export const SECURE_KEY_KEY = "reader.secureKey";

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readItem(key: string): string | null {
  try {
    return safeStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeItem(key: string, value: string): boolean {
  try {
    safeStorage()?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeItem(key: string): void {
  try {
    safeStorage()?.removeItem(key);
  } catch {
    /* 存储不可用时无需处理 */
  }
}

/** accessToken, 格式 `username:token` */
export function getAccessToken(): string | null {
  const token = readItem(ACCESS_TOKEN_KEY);
  return token && token.length > 0 ? token : null;
}

export function setAccessToken(token: string): void {
  writeItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  removeItem(ACCESS_TOKEN_KEY);
}

/** 管理密码 (secureKey), 用户管理等接口需要 */
export function getSecureKey(): string | null {
  const key = readItem(SECURE_KEY_KEY);
  return key && key.length > 0 ? key : null;
}

export function setSecureKey(key: string): void {
  writeItem(SECURE_KEY_KEY, key);
}

export function clearSecureKey(): void {
  removeItem(SECURE_KEY_KEY);
}

/** 读取并解析 JSON, 不存在或解析失败返回 null */
export function getJSON<T>(key: string): T | null {
  const raw = readItem(key);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 序列化并写入 JSON, 返回是否写入成功 */
export function setJSON<T>(key: string, value: T): boolean {
  try {
    return writeItem(key, JSON.stringify(value));
  } catch {
    return false;
  }
}
