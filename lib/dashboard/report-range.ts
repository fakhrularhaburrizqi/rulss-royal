const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_CUSTOM_RANGE_DAYS = 366;

export type ReportRangeKind = "today" | "7d" | "month" | "custom";
export type ReportGranularity = "daily" | "weekly";

export type ReportRange = {
  kind: ReportRangeKind;
  startKey: string;
  endKey: string;
  start: Date;
  endExclusive: Date;
  days: number;
  label: string;
  granularity: ReportGranularity;
  customStartKey: string | null;
  customEndKey: string | null;
  customInvalid: boolean;
};

export const REPORT_RANGE_PRESETS: ReadonlyArray<{
  kind: Exclude<ReportRangeKind, "custom">;
  label: string;
}> = [
  { kind: "today", label: "Hari Ini" },
  { kind: "7d", label: "7 Hari Terakhir" },
  { kind: "month", label: "Bulan Ini" },
];

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function stringParam(raw: string | string[] | undefined): string | null {
  if (typeof raw === "string") {
    return raw.trim();
  }
  if (Array.isArray(raw) && typeof raw[0] === "string") {
    return raw[0].trim();
  }
  return null;
}

export function isValidDateKey(key: string): boolean {
  if (!DATE_KEY_PATTERN.test(key)) {
    return false;
  }
  const [year, month, day] = key.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function dateKeyToUtcMillis(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function toJakartaDateKey(date: Date): string {
  const jakarta = new Date(date.getTime() + JAKARTA_OFFSET_MS);
  return `${jakarta.getUTCFullYear()}-${pad2(jakarta.getUTCMonth() + 1)}-${pad2(
    jakarta.getUTCDate()
  )}`;
}

export function addDaysToDateKey(key: string, days: number): string {
  return new Date(dateKeyToUtcMillis(key) + days * DAY_MS).toISOString().slice(0, 10);
}

export function diffDateKeys(fromKey: string, toKey: string): number {
  return Math.round((dateKeyToUtcMillis(toKey) - dateKeyToUtcMillis(fromKey)) / DAY_MS);
}

export function jakartaDayStart(key: string): Date {
  return new Date(dateKeyToUtcMillis(key) - JAKARTA_OFFSET_MS);
}

export function jakartaDayEndExclusive(key: string): Date {
  return new Date(dateKeyToUtcMillis(key) + DAY_MS - JAKARTA_OFFSET_MS);
}

const shortDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});

const fullDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

export function formatDateKeyShort(key: string): string {
  return shortDateFormatter.format(jakartaDayStart(key));
}

export function formatDateKeyFull(key: string): string {
  return fullDateFormatter.format(jakartaDayStart(key));
}

export function parseReportRange(
  params: Record<string, string | string[] | undefined>,
  now: Date = new Date()
): ReportRange {
  const requested = stringParam(params.range);
  const kind: ReportRangeKind =
    requested === "today" || requested === "7d" || requested === "month" || requested === "custom"
      ? requested
      : "7d";

  const todayKey = toJakartaDateKey(now);
  let startKey: string;
  let endKey: string;
  let customStartKey: string | null = null;
  let customEndKey: string | null = null;
  let customInvalid = false;

  if (kind === "today") {
    startKey = todayKey;
    endKey = todayKey;
  } else if (kind === "month") {
    startKey = `${todayKey.slice(0, 7)}-01`;
    endKey = todayKey;
  } else if (kind === "custom") {
    const rawStart = stringParam(params.start);
    const rawEnd = stringParam(params.end);
    customStartKey = rawStart !== null && isValidDateKey(rawStart) ? rawStart : null;
    customEndKey = rawEnd !== null && isValidDateKey(rawEnd) ? rawEnd : null;

    const spanDays =
      customStartKey !== null && customEndKey !== null
        ? diffDateKeys(customStartKey, customEndKey) + 1
        : null;

    if (
      customStartKey === null ||
      customEndKey === null ||
      spanDays === null ||
      spanDays < 1 ||
      spanDays > MAX_CUSTOM_RANGE_DAYS
    ) {
      customInvalid = true;
      startKey = addDaysToDateKey(todayKey, -6);
      endKey = todayKey;
    } else {
      startKey = customStartKey;
      endKey = customEndKey;
    }
  } else {
    startKey = addDaysToDateKey(todayKey, -6);
    endKey = todayKey;
  }

  const days = diffDateKeys(startKey, endKey) + 1;
  const label =
    startKey === endKey
      ? formatDateKeyFull(startKey)
      : `${formatDateKeyFull(startKey)} - ${formatDateKeyFull(endKey)}`;

  return {
    kind,
    startKey,
    endKey,
    start: jakartaDayStart(startKey),
    endExclusive: jakartaDayEndExclusive(endKey),
    days,
    label,
    granularity: days > 45 ? "weekly" : "daily",
    customStartKey,
    customEndKey,
    customInvalid,
  };
}
