"use client";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { saveRemind } from "@/app/actions/items";
import { useAction } from "./useAction";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (d: Date) => `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/**
 * "Remind me in Google Calendar": ticking puts the next date in the calendar at 10:00 HKT.
 * Notifications are the calendar's default notifications (Google Calendar settings).
 */
export default function ReminderEditor({
  target,
  initialOn,
  beforeWhat = "due date",
  next,
  calendarReady,
}: {
  target: { itemId: string } | { utilityId: string };
  initialOn: boolean;
  beforeWhat?: string;
  next: { date: string; title: string } | null; // the event this creates (ISO day)
  calendarReady: boolean;
}) {
  const [on, setOn] = useState(initialOn);
  const { pending, run } = useAction();
  const due = next ? new Date(`${next.date}T00:00:00Z`) : null;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.checked;
            setOn(v);
            run(() => saveRemind(target, v), { success: v ? "Added to Google Calendar" : "Removed from Google Calendar" });
          }}
          className="mt-0.5 h-[22px] w-[22px] flex-none accent-brand"
        />
        <span>
          <span className="block text-[15px] font-bold">Remind me in Google Calendar</span>
          <span className="block text-xs text-muted">Adds the next {beforeWhat} to your calendar at 10:00</span>
        </span>
      </label>

      {on && (
        <div className="flex items-start gap-2.5 rounded-[10px] bg-brand-soft px-3 py-2.5 text-xs text-muted">
          <CalendarDays size={16} className="mt-px flex-none text-brand" />
          {!calendarReady ? (
            <span>Google Calendar isn&apos;t connected yet. This will sync once it is.</span>
          ) : next && due ? (
            <span>
              <b className="text-brand">In your calendar:</b> “{next.title}”
              <br />
              {fmt(due)}, 10:00–10:30 HKT · notifications as set for the calendar in Google Calendar
            </span>
          ) : (
            <span>No upcoming date, so nothing is in your calendar right now.</span>
          )}
        </div>
      )}
    </div>
  );
}
