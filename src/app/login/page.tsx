"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  // Values are read from the form itself (not React state), so browser
  // autofill that never fired onChange is still picked up.
  async function login(form: HTMLFormElement) {
    if (busy) return;
    const fd = new FormData(form);
    const username = String(fd.get("username") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    if (!username || !password) {
      toast.error("Enter your username and password");
      return;
    }
    setBusy(true);
    const res = await signIn("credentials", { username, password, redirect: false });
    setBusy(false);
    if (res?.error) {
      toast.error("Wrong username or password");
      return;
    }
    router.push("/");
    router.refresh();
  }

  // Enter in either field submits explicitly (skipped while an input method
  // is composing, e.g. typing Chinese, where Enter confirms the characters).
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (e.currentTarget.form) login(e.currentTarget.form);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          login(e.currentTarget);
        }}
        className="w-full max-w-sm rounded-2xl border border-line bg-white p-6"
      >
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Sign in</h1>
        <p className="mb-6 text-sm text-muted">Subscription &amp; bill manager</p>
        <label htmlFor="username" className="mb-1.5 block text-sm font-bold">
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          className="mb-4 min-h-12 w-full rounded-xl border border-line px-3"
          onKeyDown={onKeyDown}
        />
        <label htmlFor="password" className="mb-1.5 block text-sm font-bold">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="mb-6 min-h-12 w-full rounded-xl border border-line px-3"
          onKeyDown={onKeyDown}
        />
        <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-brand font-bold text-white disabled:opacity-60">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
