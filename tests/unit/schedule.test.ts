import { describe, expect, it } from "vitest";

import { nextRun, parseSchedule } from "../../src/shared/schedule";

const at = (text: string) => new Date(text).getTime();
const local = (value: number) => {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

describe("schedules", () => {
  it("finds the next run for common schedules in local time", () => {
    const monday = at("2026-09-14T08:30:00");
    expect(local(nextRun("0 9 * * *", monday))).toBe("2026-09-14 09:00");
    expect(local(nextRun("0 9 * * *", at("2026-09-14T09:00:00")))).toBe("2026-09-15 09:00");
    expect(local(nextRun("*/15 * * * *", at("2026-09-14T08:31:10")))).toBe("2026-09-14 08:45");
    expect(local(nextRun("0 9 * * 1-5", at("2026-09-18T10:00:00")))).toBe("2026-09-21 09:00");
    expect(local(nextRun("@hourly", monday))).toBe("2026-09-14 09:00");
    expect(local(nextRun("30 6 1 * *", monday))).toBe("2026-10-01 06:30");
    expect(local(nextRun("0 0 29 2 *", monday))).toBe("2028-02-29 00:00");
    expect(local(nextRun("0 12 * * 7", monday))).toBe("2026-09-20 12:00");
  });

  it("matches either day field when both are restricted, as cron does", () => {
    // The 15th of the month or any Friday.
    expect(local(nextRun("0 8 15 * 5", at("2026-09-14T09:00:00")))).toBe("2026-09-15 08:00");
    expect(local(nextRun("0 8 15 * 5", at("2026-09-15T09:00:00")))).toBe("2026-09-18 08:00");
  });

  it("rejects malformed schedules", () => {
    expect(() => parseSchedule("0 9 * *")).toThrow("five fields");
    expect(() => parseSchedule("60 * * * *")).toThrow("out of range");
    expect(() => parseSchedule("a * * * *")).toThrow("not a valid");
    expect(() => nextRun("0 0 31 2 *", at("2026-01-01T00:00:00"))).toThrow("never runs");
  });
});
