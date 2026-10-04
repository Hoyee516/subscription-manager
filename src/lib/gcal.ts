// Google Calendar via a service account (no extra packages): sign a JWT, swap it for an
// access token, then call the Calendar REST API. The calendar must be shared with the
// service account's email with "Make changes to events".
//
// Env: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY (the key from the JSON file, \n kept),
//      GOOGLE_CALENDAR_ID (your Gmail address for your main calendar).
import { createPrivateKey, createSign, type KeyObject } from "crypto";

const email = () => process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const rawKey = () => process.env.GOOGLE_PRIVATE_KEY;

/**
 * The private key as pasted into .env.local or Vercel can arrive with literal "\n"s,
 * Windows line breaks, surrounding quotes, or with its line breaks turned into spaces.
 * Rebuild a clean PEM, then parse it once (OpenSSL 3 rejects some raw PEM strings).
 */
let parsedKey: KeyObject | null = null;
function privateKey(): KeyObject {
  if (parsedKey) return parsedKey;
  const raw = (rawKey() ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "");
  const m = raw.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
  if (!m) throw new CalendarError(0, "GOOGLE_PRIVATE_KEY isn't a PEM key (no BEGIN/END PRIVATE KEY lines).");
  const body = m[2].replace(/\s+/g, "");
  const pem = `-----BEGIN ${m[1]}-----\n${body.match(/.{1,64}/g)!.join("\n")}\n-----END ${m[1]}-----\n`;
  parsedKey = createPrivateKey({ key: pem, format: "pem" });
  return parsedKey;
}
export const defaultCalendarId = () => process.env.GOOGLE_CALENDAR_ID || null;

export function calendarConfigured(calendarId?: string | null): boolean {
  return !!(email() && rawKey() && (calendarId || defaultCalendarId()));
}

export class CalendarError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let cached: { token: string; exp: number } | null = null;

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: email(),
      scope: "https://www.googleapis.com/auth/calendar.events",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(privateKey()))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) throw new CalendarError(res.status, `Google sign-in failed: ${json.error_description ?? res.status}`);
  cached = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return cached.token;
}

async function api(calendarId: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? msg;
    } catch {}
    if (res.status === 404) msg = "Calendar or event not found — is the calendar shared with the app's service account?";
    throw new CalendarError(res.status, msg);
  }
  return res.status === 204 ? null : ((await res.json()) as { id: string });
}

export type CalEvent = {
  date: Date; // calendar day (UTC midnight)
  title: string;
  description: string;
};

/**
 * Event at 10:00–10:30 Hong Kong time on the given day. Notifications are the calendar's
 * own default notifications (set in Google Calendar settings): a service account can't
 * set notifications that show for a personal Gmail account.
 */
function body(ev: CalEvent) {
  const day = ev.date.toISOString().slice(0, 10);
  return {
    summary: ev.title,
    description: ev.description,
    start: { dateTime: `${day}T10:00:00+08:00`, timeZone: "Asia/Hong_Kong" },
    end: { dateTime: `${day}T10:30:00+08:00`, timeZone: "Asia/Hong_Kong" },
    transparency: "transparent", // doesn't block the time as busy
    reminders: { useDefault: true },
    extendedProperties: { private: { source: "subscription-manager" } },
  };
}

/** Creates the event, or updates it in place; returns the event id. */
export async function upsertEvent(calendarId: string, eventId: string | null, ev: CalEvent): Promise<string> {
  if (eventId) {
    try {
      const r = await api(calendarId, "PATCH", `/${encodeURIComponent(eventId)}`, { ...body(ev), status: "confirmed" });
      return r!.id;
    } catch (e) {
      // Deleted from the calendar by hand: create it again.
      if (!(e instanceof CalendarError) || (e.status !== 404 && e.status !== 410)) throw e;
    }
  }
  const r = await api(calendarId, "POST", "", body(ev));
  return r!.id;
}

export async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  try {
    await api(calendarId, "DELETE", `/${encodeURIComponent(eventId)}`);
  } catch (e) {
    if (e instanceof CalendarError && (e.status === 404 || e.status === 410)) return; // already gone
    throw e;
  }
}
