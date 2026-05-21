"use client";

/**
 * app/login/page.tsx
 * ---------------------------------------------------------
 * SECURE LOGIN PAGE
 * ---------------------------------------------------------
 *
 * Fixes:
 * - Saves auth token.
 * - Saves accountId for syncConfig.
 * - Notifies AccountProvider immediately after login.
 * - Calls /auth/me once after login to confirm session is restorable.
 * - Uses router.replace instead of push so Back does not return to login.
 * - Mobile-first responsive UI.
 */

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { apiClient, setAuthToken } from "../lib/api/apiClient";
import { setAccountId } from "../lib/sync/syncConfig";
import { AUTH_CHANGED_EVENT } from "../context/account-context";

// ======================================================
// TYPES
// ======================================================

type LoginResponse = {
  token: string;
  user: {
    id: string;
    accountId: string;
    email: string;
    role: string;
    fullName?: string;
    name?: string;
  };
  account?: {
    id: string;
    name: string;
    email?: string | null;
  } | null;
};

// ======================================================
// COMPONENT
// ======================================================

export default function LoginPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    return !!form.email.trim() && !!form.password.trim() && !loading;
  }, [form.email, form.password, loading]);

  const updateForm = (patch: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setError("");
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();

    if (!canSubmit) {
      setError("Enter your email and password.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const res = await apiClient<LoginResponse>("/auth/login", {
        method: "POST",
        body: {
          email: form.email.trim(),
          password: form.password,
        },
      });

      if (!res?.token) {
        throw new Error("Login succeeded but no token was returned.");
      }

      const accountId = res.user?.accountId || res.account?.id;

      if (!accountId) {
        throw new Error("Login succeeded but no accountId was returned.");
      }

      setAuthToken(res.token);
      setAccountId(accountId);

      // Tell AccountProvider to immediately restore /auth/me.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
      }

      // Confirm the token works before moving away from login.
      await apiClient("/auth/me");

      router.replace("/account");
    } catch (error: any) {
      console.error("Login failed:", error);
      setError(error?.message || "Login failed. Check your email and password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <style>{css}</style>

      <section className="login-card">
        <div className="login-brand">
          <div className="login-logo">E</div>
          <div>
            <p>Welcome back</p>
            <h1>Login</h1>
          </div>
        </div>

        <p className="login-text">Access your Eleeveon workspace.</p>

        {error && <div className="login-error">{error}</div>}

        <form className="login-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              placeholder="you@example.com"
              value={form.email}
              autoComplete="email"
              onChange={(event) => updateForm({ email: event.target.value })}
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              placeholder="Your password"
              value={form.password}
              autoComplete="current-password"
              onChange={(event) => updateForm({ password: event.target.value })}
            />
          </label>

          <button type="submit" className="login-primary" disabled={!canSubmit}>
            {loading ? "Logging in..." : "Login"}
          </button>

          <button
            type="button"
            className="login-ghost"
            onClick={() => router.push("/register")}
            disabled={loading}
          >
            Create new account
          </button>
        </form>
      </section>
    </main>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
.login-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100vw;
  display: grid;
  place-items: center;
  padding: 16px;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--primary-color, #2563eb) 14%, transparent), transparent 34%),
    var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}

.login-page *,
.login-page *::before,
.login-page *::after {
  box-sizing: border-box;
}

.login-card {
  width: min(430px, 100%);
  border-radius: 28px;
  padding: 22px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .24);
  box-shadow: 0 24px 70px rgba(15, 23, 42, .12);
  overflow: hidden;
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.login-logo {
  width: 52px;
  height: 52px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 20px;
  background: var(--primary-color, #2563eb);
  color: #fff;
  font-size: 24px;
  font-weight: 1000;
  box-shadow: 0 14px 30px color-mix(in srgb, var(--primary-color, #2563eb) 30%, transparent);
}

.login-brand p {
  margin: 0;
  color: var(--primary-color, #2563eb);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.login-brand h1 {
  margin: 1px 0 0;
  font-size: clamp(28px, 8vw, 38px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.login-text {
  margin: 12px 0 0;
  color: var(--muted, #64748b);
  font-size: 14px;
  line-height: 1.55;
  font-weight: 750;
}

.login-error {
  margin-top: 14px;
  padding: 12px;
  border-radius: 17px;
  background: rgba(239, 68, 68, .1);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, .16);
  font-size: 13px;
  font-weight: 850;
  line-height: 1.45;
}

.login-form {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}

.login-form label {
  display: grid;
  gap: 6px;
}

.login-form label span {
  color: var(--muted, #64748b);
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.login-form input {
  width: 100%;
  min-height: 46px;
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 16px;
  padding: 0 13px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  outline: none;
  font-weight: 750;
}

.login-form input:focus {
  border-color: color-mix(in srgb, var(--primary-color, #2563eb) 55%, rgba(148, 163, 184, .28));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-color, #2563eb) 12%, transparent);
}

.login-primary,
.login-ghost {
  min-height: 46px;
  border-radius: 16px;
  padding: 0 16px;
  font-weight: 950;
  cursor: pointer;
}

.login-primary {
  border: 0;
  background: var(--primary-color, #2563eb);
  color: #fff;
}

.login-primary:disabled,
.login-ghost:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.login-ghost {
  border: 1px solid rgba(148, 163, 184, .25);
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
}

@media (max-width: 420px) {
  .login-page {
    padding: 10px;
  }

  .login-card {
    padding: 18px;
    border-radius: 24px;
  }

  .login-logo {
    width: 48px;
    height: 48px;
    border-radius: 18px;
  }
}
`;
