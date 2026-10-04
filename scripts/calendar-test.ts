// One-off check that Google Calendar is connected.
// Creates a test event tomorrow at 10:00 HKT; it should carry the calendar's default notifications.
//   npx tsx --env-file=.env.local scripts/calendar-test.ts           (create)
//   npx tsx --env-file=.env.local scripts/calendar-test.ts --delete  (remove it afterwards)
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { calendarConfigured, defaultCalendarId, deleteEvent, upsertEvent } from "../src/lib/gcal";

const FILE = ".calendar-test-event";

async function main() {
  const cal = defaultCalendarId();
  if (!cal || !calendarConfigured(cal)) throw new Error("Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and GOOGLE_CALENDAR_ID in .env.local first.");
  if (process.argv.includes("--delete")) {
    if (!existsSync(FILE)) return console.log("No test event recorded.");
    await deleteEvent(cal, readFileSync(FILE, "utf8").trim());
    unlinkSync(FILE);
    return console.log("Test event deleted.");
  }
  const t = new Date(Date.now() + 8 * 3600_000); // HK now
  const tomorrow = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1));
  const id = await upsertEvent(cal, null, {
    date: tomorrow,
    title: "Test · Subscription Manager · HK$1",
    description: "Test event — safe to delete.",
  });
  writeFileSync(FILE, id);
  console.log(`Created test event for ${tomorrow.toISOString().slice(0, 10)} 10:00 HKT.`);
  console.log("Open it in Google Calendar: its notifications should be the calendar's default notifications.");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
