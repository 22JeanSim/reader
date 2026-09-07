/**
 * 源站简介常带原始 HTML (内联 style/&nbsp;/<br>): 去标签、解码实体、压缩空白,
 * 保留换行 (展示层 whitespace-pre-line 依赖). 无标记时原样 trim 返回.
 */
export function plainIntro(raw: string): string {
  if (/^[.…・·\s]+$/.test(raw)) {
    return ""; // 源站占位简介 (纯省略号/点号) 视为无简介
  }
  if (!raw.includes("<") && !raw.includes("&")) {
    return raw.trim();
  }
  const withBreaks = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr)>/gi, "\n");
  const noTags = withBreaks.replace(/<[^>]*>/g, "");
  const decoded = noTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCharCode(Number(dec)));
  const cleaned = decoded
    .split("\n")
    .map((line) => line.replace(/[ \t　]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
  // 源站占位简介 (纯省略号/点号) 视为无简介, 让卡片走兜底而非显示「...」
  if (/^[.…・·\s]+$/.test(cleaned)) {
    return "";
  }
  return cleaned;
}
