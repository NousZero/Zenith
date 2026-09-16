// Five-field cron schedules (minute hour day-of-month month day-of-week) in local time,
// plus the @hourly, @daily, and @weekly shortcuts.

const SHORTCUTS: Record<string, string> = {
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@weekly": "0 0 * * 0",
};

const RANGES: readonly [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
];

export interface Schedule {
  minutes: Set<number>;
  hours: Set<number>;
  days: Set<number>;
  months: Set<number>;
  weekdays: Set<number>;
  // Cron matches either day field when both are restricted.
  anyDay: boolean;
}

function parseField(field: string, [min, max]: [number, number], index: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const match = /^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(part);
    if (!match) throw new Error(`"${part}" is not a valid schedule value.`);
    const start = match[1] === "*" ? min : Number(match[1]);
    const end =
      match[2] !== undefined ? Number(match[2]) : match[1] === "*" || match[3] ? max : start;
    const step = match[3] !== undefined ? Number(match[3]) : 1;
    // Day of week 7 also means Sunday.
    const top = index === 4 ? 7 : max;
    if (start < min || end > top || start > end || step < 1) {
      throw new Error(`"${part}" is out of range (${min}-${max}).`);
    }
    for (let value = start; value <= end; value += step)
      values.add(index === 4 ? value % 7 : value);
  }
  return values;
}

export function parseSchedule(expression: string): Schedule {
  const expanded = SHORTCUTS[expression.trim()] ?? expression.trim();
  const fields = expanded.split(/\s+/);
  if (fields.length !== 5) {
    throw new Error("A schedule needs five fields: minute hour day month weekday.");
  }
  const [minutes, hours, days, months, weekdays] = fields.map((field, index) =>
    parseField(field, RANGES[index] ?? [0, 0], index),
  ) as [Set<number>, Set<number>, Set<number>, Set<number>, Set<number>];
  return {
    minutes,
    hours,
    days,
    months,
    weekdays,
    anyDay: fields[2] === "*" || fields[4] === "*",
  };
}

function dayMatches(schedule: Schedule, date: Date): boolean {
  const dayOfMonth = schedule.days.has(date.getDate());
  const dayOfWeek = schedule.weekdays.has(date.getDay());
  return schedule.anyDay ? dayOfMonth && dayOfWeek : dayOfMonth || dayOfWeek;
}

// The first matching minute strictly after `after`, searching up to about four years ahead.
export function nextRun(expression: string, after: number): number {
  const schedule = parseSchedule(expression);
  const date = new Date(after);
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() + 1);
  const limit = after + 4 * 366 * 24 * 60 * 60 * 1000;
  while (date.getTime() <= limit) {
    if (!schedule.months.has(date.getMonth() + 1)) {
      date.setMonth(date.getMonth() + 1, 1);
      date.setHours(0, 0, 0, 0);
      continue;
    }
    if (!dayMatches(schedule, date)) {
      date.setDate(date.getDate() + 1);
      date.setHours(0, 0, 0, 0);
      continue;
    }
    if (!schedule.hours.has(date.getHours())) {
      date.setHours(date.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!schedule.minutes.has(date.getMinutes())) {
      date.setMinutes(date.getMinutes() + 1, 0, 0);
      continue;
    }
    return date.getTime();
  }
  throw new Error("That schedule never runs.");
}

export const SCHEDULE_PRESETS: readonly { label: string; expression: string }[] = [
  { label: "Every hour", expression: "0 * * * *" },
  { label: "Every day at 9:00", expression: "0 9 * * *" },
  { label: "Weekdays at 9:00", expression: "0 9 * * 1-5" },
  { label: "Every Monday at 9:00", expression: "0 9 * * 1" },
  { label: "Every 15 minutes", expression: "*/15 * * * *" },
];
