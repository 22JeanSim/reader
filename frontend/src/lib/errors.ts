/**
 * 后端/协议技术串 → 读者可读文案映射.
 * 后端 errorMsg 可能透传 JVM/V8/协议异常原文, 直接进 UI 会把栈级术语甩给读者;
 * 这里按特征归类为人话 + 下一步建议, 未命中且本身是中文可读串时原样返回.
 * 原始串仍应进 console 供调试 (调用方负责).
 */
const FALLBACK = "加载失败, 请稍后重试";

const RULES: Array<[RegExp, string]> = [
  [/NEED_LOGIN/, "登录态已失效, 请重新登录"],
  [/XmlPullParserException|kxml2|parser\s+class/i, "内容解析失败: 订阅规则与页面结构不匹配, 请检查列表/正文规则"],
  [/SocketTimeoutException|timed?\s*out/i, "连接超时: 目标站点响应过慢或暂时不可达"],
  [/ConnectException|Failed to connect|UnknownHost|ECONNREFUSED/i, "无法连接目标站点: 请检查地址与网络"],
  [/SSLException|certificate|handshake/i, "安全连接失败: 目标站点证书异常"],
  [/^JSON 解析失败/, "JSON 格式有误: 请检查括号、逗号与引号是否配对"],
  [/Unexpected token|not valid JSON|JSON 解析失败/i, "返回内容不是有效 JSON: 地址可能指向网页而非接口"],
  [/SSE|连接中断|stream/i, "连接中断: 已保留当前结果, 可继续加载"],
  [/未配置书源/, "本书的书源不可用: 请到书源页检查或换源后重试"],
  [/RSS源不存在/, "订阅不存在或刚被修改: 服务端缓存约 5 秒后刷新, 请稍后重试"],
  [/^org\.|java\.|javax\.|Exception|Error\s+code/i, FALLBACK],
];

/** 把任意后端错误串转成读者可读文案; 空串/纯技术串给兜底, 中文可读串原样返回. */
export function humanizeError(raw: string | null | undefined, fallback: string = FALLBACK): string {
  const text = (raw ?? "").trim();
  if (text.length === 0) return fallback;
  for (const [pattern, message] of RULES) {
    if (pattern.test(text)) return message;
  }
  return text;
}

/** 调试用: 保留原始串进 console, UI 用人话. */
export function reportError(raw: string | null | undefined, context: string): string {
  if (raw && raw.trim().length > 0) {
    console.warn(`[reader] ${context}:`, raw);
  }
  return humanizeError(raw);
}
