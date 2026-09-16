import { describe, expect, it } from "vitest";

import { formatRelativeTime, formatTokens } from "../../src/renderer/lib/format";

describe("formatTokens", () => {
  it("shows exact counts below one thousand and abbreviates above", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1000)).toBe("1.0k");
    expect(formatTokens(12_345)).toBe("12.3k");
    expect(formatTokens(250_000)).toBe("250k");
    expect(formatTokens(1_048_576)).toBe("1M");
    expect(formatTokens(1_500_000)).toBe("1.5M");
  });
});

describe("formatRelativeTime", () => {
  const now = 1_800_000_000_000;

  it("buckets elapsed time into now, minutes, hours, and days", () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe("now");
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5m");
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe("3h");
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe("2d");
  });

  it("treats timestamps in the future as now", () => {
    expect(formatRelativeTime(now + 60_000, now)).toBe("now");
  });

  it("falls back to a calendar date after a week", () => {
    expect(formatRelativeTime(now - 10 * 86_400_000, now)).not.toMatch(/^\d+[mhd]$|^now$/);
  });
});
