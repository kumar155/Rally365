import type { StatsRange } from "./types";

const LOCALE = "en-IN";

/** `YYYY-MM-DD` in the browser's local timezone. */
export const localDateKey = (date: Date = new Date()) => {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
};

/** `YYYY-MM` in the browser's local timezone. */
export const localMonthKey = (date: Date = new Date()) => localDateKey(date).slice(0, 7);

export const parseDateKey = (key: string) => new Date(`${key}T00:00:00`);

/** Parses a date-only key at midday so timezone shifts cannot move it to another day. */
export const parseDateKeyNoon = (key: string) => new Date(`${key}T12:00:00`);

export const parseMonthKey = (key: string) => new Date(`${key}-01T12:00:00`);

export const shiftMonthKey = (key: string, direction: number) => {
  const d = parseMonthKey(key);
  d.setMonth(d.getMonth() + direction);
  return localMonthKey(d);
};

export const startOfWeek = (date: Date) => {
  const start = new Date(date);
  const day = start.getDay();
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  start.setHours(0, 0, 0, 0);
  return start;
};

export const shiftDateKey = (key: string, range: StatsRange, direction: number) => {
  const d = parseDateKey(key);
  if (range === "DAILY") d.setDate(d.getDate() + direction);
  else if (range === "WEEKLY") d.setDate(d.getDate() + direction * 7);
  else d.setMonth(d.getMonth() + direction);
  return localDateKey(d);
};

/** Half-open `[start, end)` interval covering the range that contains `key`. */
export const rangeBounds = (key: string, range: StatsRange) => {
  const anchor = parseDateKey(key);

  if (range === "DAILY") {
    const end = new Date(anchor);
    end.setDate(end.getDate() + 1);
    return { start: anchor, end };
  }

  if (range === "WEEKLY") {
    const start = startOfWeek(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  const start = new Date(anchor);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(start.getMonth() + 1, 1);
  end.setHours(0, 0, 0, 0);
  return { start, end };
};

export const formatDayMonth = (date: Date) => date.toLocaleDateString(LOCALE, { day: "numeric", month: "short" });

export const formatDayMonthYear = (date: Date) =>
  date.toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" });

export const formatWeekdayDayMonthYear = (date: Date) =>
  date.toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export const formatMonthYear = (date: Date) => date.toLocaleDateString(LOCALE, { month: "long", year: "numeric" });

export const rangeLabel = (key: string, range: StatsRange) => {
  const anchor = parseDateKey(key);
  if (range === "DAILY") return formatWeekdayDayMonthYear(anchor);
  if (range === "MONTHLY") return formatMonthYear(anchor);

  const start = startOfWeek(anchor);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${formatDayMonth(start)} – ${formatDayMonthYear(end)}`;
};
