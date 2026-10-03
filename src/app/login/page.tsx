"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
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

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleLogin} className="w-full max-w-sm rounded-2xl border border-line bg-white p-6">
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Sign in</h1>
        <p className="mb-6 text-sm text-muted">Subscription &amp; bill manager</p>
        <label htmlFor="username" className="mb-1.5 block text-sm font-bold">Username</label>
        <input
          id="username"
          autoComplete="username"
          className="mb-4 min-h-12 w-full rounded-xl border border-line px-3"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <label htmlFor="password" className="mb-1.5 block text-sm font-bold">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="mb-6 min-h-12 w-full rounded-xl border border-line px-3"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 w-full rounded-xl bg-brand font-bold text-white disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
