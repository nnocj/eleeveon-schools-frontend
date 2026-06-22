"use client";

/**
 * app/register/page.tsx
 * ---------------------------------------------------------
 * SECURE REGISTER PAGE
 * ---------------------------------------------------------
 */

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import { apiClient, setAuthToken } from "../lib/api/apiClient";
import { setAccountId } from "../lib/sync/syncConfig";

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    accountName: "",
  });

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const update = (patch: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const submit = async () => {
    if (!form.fullName.trim()) return alert("Enter your full name");
    if (!form.accountName.trim()) return alert("Enter school or business account name");
    if (!form.email.trim()) return alert("Enter your email address");
    if (!form.password.trim()) return alert("Enter your password");
    if (form.password.trim().length < 6) return alert("Password must be at least 6 characters");

    try {
      setLoading(true);

      const res = await apiClient<{
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
        } | null;
      }>("/auth/register", {
        method: "POST",
        body: {
          fullName: form.fullName.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          accountName: form.accountName.trim(),
        },
      });

      if (!res.token) throw new Error("Account created but no login token was returned.");
      if (!res.user?.accountId) throw new Error("Account created but no account ID was returned.");

      setAuthToken(res.token);
      setAccountId(res.user.accountId);

      router.replace("/account");
    } catch (error: any) {
      alert(error?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !loading) submit();
  };

  return (
    <main className="register-page">
      <style>{css}</style>

      <section className="register-card">
        <div className="register-badge">🏫</div>

        <h1>Create Account</h1>
        <p>Create your Eleeveon owner workspace.</p>

        <div className="register-grid">
          <input
            placeholder="Full name"
            value={form.fullName}
            onChange={(event) => update({ fullName: event.target.value })}
            onKeyDown={handleKeyDown}
            autoComplete="name"
          />

          <input
            placeholder="School / business account name"
            value={form.accountName}
            onChange={(event) => update({ accountName: event.target.value })}
            onKeyDown={handleKeyDown}
            autoComplete="organization"
          />

          <input
            placeholder="Email"
            value={form.email}
            onChange={(event) => update({ email: event.target.value })}
            onKeyDown={handleKeyDown}
            autoComplete="email"
          />

          <div className="password-wrap">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={form.password}
              onChange={(event) => update({ password: event.target.value })}
              onKeyDown={handleKeyDown}
              autoComplete="new-password"
            />

            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
              disabled={loading}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>

          <button type="button" onClick={submit} disabled={loading}>
            {loading ? "Creating..." : "Create Account"}
          </button>

          <button
            type="button"
            className="ghost"
            onClick={() => router.push("/login")}
            disabled={loading}
          >
            Already have account? Login
          </button>
        </div>
      </section>
    </main>
  );
}

const css = `
.register-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
  display: grid;
  place-items: center;
  padding: 16px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--primary-color, #2563eb) 18%, transparent), transparent 34%),
    var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
}

.register-page *,
.register-page *::before,
.register-page *::after {
  box-sizing: border-box;
}

.register-card {
  width: min(460px, 100%);
  border-radius: 28px;
  padding: 24px;
  background: var(--surface, #ffffff);
  border: 1px solid rgba(148, 163, 184, .24);
  box-shadow: 0 24px 70px rgba(15, 23, 42, .12);
  overflow: hidden;
}

.register-badge {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  background: color-mix(in srgb, var(--primary-color, #2563eb) 13%, #fff);
  font-size: 26px;
}

.register-card h1 {
  margin: 16px 0 4px;
  font-size: clamp(28px, 9vw, 38px);
  font-weight: 1000;
  letter-spacing: -.06em;
  line-height: 1;
}

.register-card p {
  margin: 0;
  color: var(--muted, #64748b);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.55;
}

.register-grid {
  display: grid;
  gap: 12px;
  margin-top: 20px;
}

.register-grid input,
.password-wrap input {
  width: 100%;
  min-height: 48px;
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 16px;
  padding: 0 14px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  outline: none;
  font: inherit;
  font-weight: 750;
}

.password-wrap {
  position: relative;
  width: 100%;
  min-width: 0;
}

.password-wrap input {
  padding-right: 52px;
}

.password-toggle {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  min-height: 40px !important;
  border: 0 !important;
  border-radius: 14px !important;
  padding: 0 !important;
  background: rgba(148, 163, 184, .12) !important;
  color: var(--text, #0f172a) !important;
  display: grid;
  place-items: center;
  font-size: 17px;
  cursor: pointer;
}

.register-grid input:focus,
.password-wrap input:focus {
  border-color: color-mix(in srgb, var(--primary-color, #2563eb) 60%, rgba(148,163,184,.28));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-color, #2563eb) 13%, transparent);
}

.register-grid button {
  min-height: 48px;
  border: 0;
  border-radius: 16px;
  padding: 0 16px;
  background: var(--primary-color, #2563eb);
  color: #fff;
  font: inherit;
  font-weight: 950;
  cursor: pointer;
}

.register-grid button:disabled {
  opacity: .58;
  cursor: not-allowed;
}

.register-grid button.ghost {
  border: 1px solid rgba(148, 163, 184, .24);
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
}

@media (max-width: 420px) {
  .register-page {
    padding: 10px;
  }

  .register-card {
    border-radius: 24px;
    padding: 18px;
  }

  .register-grid input,
  .register-grid button,
  .password-wrap input {
    min-height: 46px;
    border-radius: 15px;
  }

  .password-toggle {
    width: 38px;
    height: 38px;
    min-height: 38px !important;
    border-radius: 13px !important;
  }
}
`;