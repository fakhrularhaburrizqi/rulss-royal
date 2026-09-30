import { MAX_ORDER_SEQ_PER_DAY } from "./constants";
import { OrderDomainError } from "./errors";

const DATE_PATTERN = /^\d{8}$/;
const SEQUENCE_PATTERN = /^\d{4}$/;
const SEQUENCE_PAD = 4;
const ORDER_PREFIX_ROOT = "OUT";

export function orderNumberPrefix(outletCode: string, yyyymmdd: string): string {
  if (typeof outletCode !== "string" || outletCode.trim() === "") {
    throw new OrderDomainError("INVALID_INPUT");
  }
  if (typeof yyyymmdd !== "string" || !DATE_PATTERN.test(yyyymmdd)) {
    throw new OrderDomainError("INVALID_INPUT");
  }
  return `${ORDER_PREFIX_ROOT}-${outletCode.trim()}-${yyyymmdd}-`;
}

export function formatOrderNumber(prefix: string, seq: number): string {
  if (typeof prefix !== "string" || prefix.trim() === "") {
    throw new OrderDomainError("INVALID_INPUT");
  }
  if (typeof seq !== "number" || !Number.isInteger(seq)) {
    throw new OrderDomainError("INVALID_INPUT");
  }
  if (seq < 1) {
    throw new OrderDomainError("INVALID_INPUT");
  }
  if (seq > MAX_ORDER_SEQ_PER_DAY) {
    throw new OrderDomainError("ORDER_LIMIT_REACHED");
  }
  return `${prefix}${String(seq).padStart(SEQUENCE_PAD, "0")}`;
}

export function parseSequence(orderNumber: string): number | null {
  if (typeof orderNumber !== "string") {
    return null;
  }
  const separatorIndex = orderNumber.lastIndexOf("-");
  if (separatorIndex === -1) {
    return null;
  }
  const segment = orderNumber.slice(separatorIndex + 1);
  if (!SEQUENCE_PATTERN.test(segment)) {
    return null;
  }
  const value = Number(segment);
  if (value < 1 || value > MAX_ORDER_SEQ_PER_DAY) {
    return null;
  }
  return value;
}

export function maxSequence(orderNumbers: readonly string[], prefix: string): number {
  if (typeof prefix !== "string" || prefix.trim() === "") {
    throw new OrderDomainError("INVALID_INPUT");
  }
  let highest = 0;
  for (const entry of orderNumbers) {
    if (typeof entry !== "string" || !entry.startsWith(prefix)) {
      continue;
    }
    const segment = entry.slice(prefix.length);
    if (!SEQUENCE_PATTERN.test(segment)) {
      continue;
    }
    const value = Number(segment);
    if (value < 1 || value > MAX_ORDER_SEQ_PER_DAY) {
      continue;
    }
    if (value > highest) {
      highest = value;
    }
  }
  return highest;
}

export function resolveLocalDate(now: Date, timeZone: string): string {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new OrderDomainError("INTERNAL_ERROR");
  }
  if (typeof timeZone !== "string" || timeZone.trim() === "") {
    throw new OrderDomainError("INTERNAL_ERROR");
  }

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
  } catch {
    throw new OrderDomainError("INTERNAL_ERROR");
  }

  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    throw new OrderDomainError("INTERNAL_ERROR");
  }
  return `${year}${month}${day}`;
}
