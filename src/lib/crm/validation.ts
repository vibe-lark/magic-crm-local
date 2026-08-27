import { CrmError } from "./error";

export const CUSTOMER_STAGES = ["线索", "意向", "客户", "停用"] as const;
export const CUSTOMER_SOURCES = ["主动开发", "客户转介绍", "市场活动", "官网", "其他"] as const;
export const ACTIVITY_TYPES = ["电话", "会议", "邮件", "拜访", "其他"] as const;

export function requiredString(value: unknown, name: string, max = 200): string {
  const text = String(value ?? "").trim();
  if (!text) throw new CrmError("VALIDATION_ERROR", `${name}不能为空`);
  if (text.length > max) throw new CrmError("VALIDATION_ERROR", `${name}不能超过 ${max} 个字符`);
  return text;
}

export function optionalString(value: unknown, name: string, max = 2_000): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  if (text.length > max) throw new CrmError("VALIDATION_ERROR", `${name}不能超过 ${max} 个字符`);
  return text || null;
}

export function enumValue<T extends readonly string[]>(value: unknown, name: string, values: T, fallback?: T[number]): T[number] {
  const text = String(value ?? fallback ?? "").trim();
  if (!values.includes(text)) throw new CrmError("VALIDATION_ERROR", `${name}必须是：${values.join("、")}`);
  return text as T[number];
}

export function dateValue(value: unknown, name: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new CrmError("VALIDATION_ERROR", `${name}必须是有效的 ISO 8601 时间`);
  return date.toISOString();
}

export function booleanValue(value: unknown): boolean | undefined {
  return value === undefined ? undefined : Boolean(value);
}
