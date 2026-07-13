"use client";

import { useEffect } from "react";
import { describeSchedule, type Frequency, type Schedule } from "@/server/automations/schedule";

const inputCls =
  "rounded-lg border border-border-token bg-background px-2 py-1.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-ring";

const FREQ: { v: Frequency; label: string }[] = [
  { v: "hourly", label: "Every hour" },
  { v: "daily", label: "Every day" },
  { v: "weekly", label: "Every week" },
  { v: "monthly", label: "Every month" },
];
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 5-minute steps
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
const pad = (n: number) => String(n).padStart(2, "0");

/** Friendly schedule editor — builds the trigger config spec; no cron typing. */
export function ScheduleBuilder({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const browserTz =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  const spec: Required<Schedule> = {
    frequency: (config.frequency as Frequency) ?? "daily",
    minute: Number(config.minute ?? 0),
    hour: Number(config.hour ?? 9),
    weekday: Number(config.weekday ?? 1),
    day: Number(config.day ?? 1),
    timezone: (config.timezone as string) || browserTz,
  };

  // Persist defaults the first time this trigger is chosen (config starts {}),
  // so saving works even if the user doesn't touch a dropdown.
  useEffect(() => {
    if (!config.frequency) onChange({ ...spec });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<Schedule>) => onChange({ ...spec, ...patch });

  const TimeOfDay = (
    <label className="flex items-center gap-1.5 text-sm text-muted">
      at
      <select className={inputCls} value={spec.hour} onChange={(e) => set({ hour: Number(e.target.value) })}>
        {HOURS.map((h) => <option key={h} value={h}>{pad(h)}</option>)}
      </select>
      :
      <select className={inputCls} value={spec.minute} onChange={(e) => set({ minute: Number(e.target.value) })}>
        {MINUTES.map((m) => <option key={m} value={m}>{pad(m)}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <select className={inputCls} value={spec.frequency} onChange={(e) => set({ frequency: e.target.value as Frequency })}>
          {FREQ.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
        </select>

        {spec.frequency === "weekly" && (
          <label className="flex items-center gap-1.5 text-sm text-muted">
            on
            <select className={inputCls} value={spec.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>
              {DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </label>
        )}

        {spec.frequency === "monthly" && (
          <label className="flex items-center gap-1.5 text-sm text-muted">
            on day
            <select className={inputCls} value={spec.day} onChange={(e) => set({ day: Number(e.target.value) })}>
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        )}

        {spec.frequency === "hourly" ? (
          <label className="flex items-center gap-1.5 text-sm text-muted">
            at minute
            <select className={inputCls} value={spec.minute} onChange={(e) => set({ minute: Number(e.target.value) })}>
              {MINUTES.map((m) => <option key={m} value={m}>:{pad(m)}</option>)}
            </select>
          </label>
        ) : (
          TimeOfDay
        )}
      </div>

      <p className="rounded-lg bg-accent-soft/60 px-2.5 py-1.5 text-xs text-accent-hover">
        {describeSchedule(spec)} · {spec.timezone}
      </p>
    </div>
  );
}
