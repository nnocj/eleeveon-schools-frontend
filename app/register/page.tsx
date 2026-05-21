"use client";

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

  const update = (patch: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const submit = async () => {
    try {
      setLoading(true);

      const res = await apiClient<any>("/auth/register", {
        method: "POST",
        body: form,
      });

      setAuthToken(res.token);
      setAccountId(res.user.accountId);

      router.push("/account");
    } catch (error: any) {
      alert(error.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={page}>
      <section style={card}>
        <h1 style={title}>Create Account</h1>
        <p style={text}>Create your Eleeveon owner account.</p>

        <div style={grid}>
          <input style={input} placeholder="Full name" value={form.fullName} onChange={(e) => update({ fullName: e.target.value })} />
          <input style={input} placeholder="School / business account name" value={form.accountName} onChange={(e) => update({ accountName: e.target.value })} />
          <input style={input} placeholder="Email" value={form.email} onChange={(e) => update({ email: e.target.value })} />
          <input style={input} type="password" placeholder="Password" value={form.password} onChange={(e) => update({ password: e.target.value })} />

          <button style={button} onClick={submit} disabled={loading}>
            {loading ? "Creating..." : "Create Account"}
          </button>

          <button style={ghost} onClick={() => router.push("/login")}>
            Already have account? Login
          </button>
        </div>
      </section>
    </main>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 16,
  background: "var(--bg)",
  color: "var(--text)",
};

const card: React.CSSProperties = {
  width: "min(460px, 100%)",
  background: "var(--surface)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 24,
  padding: 24,
  boxShadow: "0 18px 46px rgba(15,23,42,0.10)",
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 30,
  fontWeight: 950,
};

const text: React.CSSProperties = {
  opacity: 0.68,
  fontWeight: 650,
};

const grid: React.CSSProperties = {
  display: "grid",
  gap: 12,
  marginTop: 18,
};

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "13px 14px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "var(--surface)",
  color: "var(--text)",
};

const button: React.CSSProperties = {
  border: "none",
  borderRadius: 14,
  padding: "13px 16px",
  background: "var(--primary-color)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const ghost: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.10)",
  borderRadius: 14,
  padding: "13px 16px",
  background: "var(--surface)",
  color: "var(--text)",
  fontWeight: 850,
  cursor: "pointer",
};