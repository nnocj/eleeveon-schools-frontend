"use client";

/** Profile for non-owner school/branch AppUsers. No Account mutations. */
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "../../context/account-context";
import { apiRequest } from "../../lib/platformApi";
import { db } from "../../lib/db/db";
import { saveImageAsset, attachMediaAssetToOwner, getMediaObjectUrl } from "../../lib/media/mediaAssetUtils";

type User = { id?: string; accountId?: string; fullName?: string; email?: string; phone?: string | null; preferredLocale?: string | null; role?: string; passwordChangedAt?: string | null; photoMediaId?: string | null; photo?: string | null };
type ProfilePayload = { user?: User | null; account?: unknown };
const str = (value: unknown) => String(value ?? "").trim();
function cachedUser(): User | null {
  if (typeof window === "undefined") return null;
  for (const key of ["eleeveon_auth_user", "eleeveon_account_user", "user"]) {
    try { const value = window.localStorage.getItem(key); if (value) return JSON.parse(value) as User; } catch {}
  }
  return null;
}
function storeUser(user: User) {
  if (typeof window === "undefined") return;
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (const key of ["eleeveon_auth_user", "eleeveon_account_user", "user"]) {
      try {
        const raw = storage.getItem(key);
        if (!raw) continue;
        const old = JSON.parse(raw);
        if (str(old?.id) && str(user.id) && str(old.id) !== str(user.id)) continue;
        storage.setItem(key, JSON.stringify({ ...old, ...user }));
      } catch {}
    }
  }
}

export default function WorkspaceAppUserProfile() {
  const router = useRouter();
  const { authenticated, loading: authLoading, user: contextUser } = useAccount() as any;
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState({ fullName: "", phone: "", preferredLocale: "en-GH" });
  const [email, setEmail] = useState({ newEmail: "", currentPassword: "" });
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [tab, setTab] = useState<"details" | "email" | "password">("details");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const photoPicker = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const identity = str(contextUser?.id);

  useEffect(() => {
    if (authLoading) return;
    if (!authenticated) { router.replace("/login"); return; }
    const id = ++requestId.current;
    const local = cachedUser() || (contextUser as User | null);
    if (local && (!identity || !local.id || str(local.id) === identity)) {
      setUser(local);
      setForm({ fullName: str(local.fullName), phone: str(local.phone), preferredLocale: str(local.preferredLocale) || "en-GH" });
      setEmail({ newEmail: str(local.email), currentPassword: "" });
      setLoading(false);
    }
    apiRequest<ProfilePayload>("/accounts/me/profile")
      .then((response) => {
        if (id !== requestId.current) return;
        const next = response?.user;
        if (!next || (identity && str(next.id) !== identity)) throw new Error("Profile identity could not be confirmed.");
        setUser(next);
        setForm({ fullName: str(next.fullName), phone: str(next.phone), preferredLocale: str(next.preferredLocale) || "en-GH" });
        setEmail({ newEmail: str(next.email), currentPassword: "" });
        storeUser(next);
      })
      .catch((err) => { if (id === requestId.current) setNotice(`Live profile unavailable: ${err?.message || "check your connection"}.`); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
    return () => { requestId.current++; };
  }, [authenticated, authLoading, identity, router]);

  useEffect(() => {
    let cancelled = false;
    let ownedObjectUrl = "";
    async function resolvePhoto() {
      const mediaId = str(user?.photoMediaId);
      if (mediaId) {
        try {
          const url = await getMediaObjectUrl(mediaId);
          if (cancelled) return;
          if (url) { ownedObjectUrl = url; setPhotoUrl(url); return; }
        } catch {}
      }
      if (!cancelled) setPhotoUrl(str(user?.photo));
    }
    void resolvePhoto();
    return () => { cancelled = true; /* media helper manages cached URLs */ };
  }, [user?.photoMediaId, user?.photo]);

  async function updatePhoto(file?: File) {
    if (!file || !user?.id) return;
    setError(""); setNotice("");
    if (!file.type.startsWith("image/")) return setError("Choose an image file.");
    if (file.size > 15 * 1024 * 1024) return setError("Choose an image under 15 MB.");
    setPhotoBusy(true);
    try {
      const accountId = str(user.accountId || (contextUser as any)?.accountId);
      if (!accountId) throw new Error("The account identity is not ready.");
      const result = await saveImageAsset(file, {
        accountId, ownerTable: "appUsers", ownerCloudId: str(user.id),
        fieldKey: "photo", variant: "avatar", replaceExisting: true,
      } as any);
      const assetId = str(result.assetId);
      if (!assetId) throw new Error("The photo could not be saved locally.");
      // The AppUser, not the Account, owns personal profile media.
      const response = await apiRequest<ProfilePayload>("/accounts/me/profile", {
        method: "PATCH", body: JSON.stringify({ photoMediaId: assetId }),
      } as any);
      const updated = response?.user;
      if (!updated || str(updated.id) !== str(user.id)) throw new Error("The server did not confirm this AppUser photo update.");
      await attachMediaAssetToOwner({ assetId, ownerTable: "appUsers", ownerId: str(user.id) } as any);
      try { await (db as any).appUsers?.update?.(str(user.id), { photoMediaId: assetId }); } catch {}
      setUser({ ...updated, photoMediaId: assetId });
      storeUser({ ...updated, photoMediaId: assetId });
      setPhotoUrl(result.previewUrl || "");
      setNotice("Profile photo updated.");
    } catch (err: any) {
      setError(err?.message || "Unable to update profile photo. The server may need AppUser photo support.");
    } finally { setPhotoBusy(false); if (photoPicker.current) photoPicker.current.value = ""; }
  }

  async function submitDetails(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (!form.fullName.trim()) return setError("Enter your full name.");
    setSaving(true);
    try {
      const result = await apiRequest<ProfilePayload>("/accounts/me/profile", { method: "PATCH", body: JSON.stringify({ fullName: form.fullName.trim(), phone: form.phone.trim(), preferredLocale: form.preferredLocale.trim() }) } as any);
      const updated = result?.user;
      if (!updated || (user?.id && str(updated.id) !== str(user.id))) throw new Error("Profile update could not be verified.");
      setUser(updated); storeUser(updated); setNotice("Personal details updated.");
    } catch (err: any) { setError(err?.message || "Could not update your details."); }
    finally { setSaving(false); }
  }
  async function submitEmail(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.newEmail.trim())) return setError("Enter a valid email address.");
    if (!email.currentPassword) return setError("Enter your current password.");
    setSaving(true);
    try {
      // The backend must authorize this endpoint for the current AppUser,
      // not treat all callers as the Account owner.
      const response = await apiRequest<ProfilePayload>("/accounts/me/email", { method: "PATCH", body: JSON.stringify({ newEmail: email.newEmail.trim().toLowerCase(), currentPassword: email.currentPassword }) } as any);
      const updated = response?.user;
      if (!updated || (user?.id && str(updated.id) !== str(user.id))) throw new Error("Email change could not be verified.");
      setUser(updated); storeUser(updated); setEmail({ newEmail: str(updated.email), currentPassword: "" }); setNotice("Login email updated.");
    } catch (err: any) { setError(err?.message || "Could not change login email."); }
    finally { setSaving(false); }
  }
  async function submitPassword(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (!password.currentPassword) return setError("Enter your current password.");
    if (password.newPassword.length < 6) return setError("New password must contain at least six characters.");
    if (password.newPassword !== password.confirmPassword) return setError("The passwords do not match.");
    setSaving(true);
    try {
      await apiRequest("/accounts/me/password", { method: "PATCH", body: JSON.stringify({ currentPassword: password.currentPassword, newPassword: password.newPassword }) } as any);
      setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" }); setNotice("Password updated.");
    } catch (err: any) { setError(err?.message || "Could not change your password."); }
    finally { setSaving(false); }
  }

  return <main className="wp-page">
    <style>{css}</style>
    <div className="wp-container">
      <header className="wp-header"><button type="button" onClick={() => router.back()} aria-label="Return to workspace">← Back</button><div><h1>My profile</h1><p>Manage your personal AppUser details and sign-in security.</p></div></header>
      <section className="wp-identity"><span className="wp-avatar">{photoUrl ? <img src={photoUrl} alt="My profile photo" /> : (str(user?.fullName).slice(0,1).toUpperCase() || "U")}</span><div className="wp-identity-copy"><strong>{str(user?.fullName) || "Your profile"}</strong><small>{str(user?.email)} · {str(user?.role).replaceAll("_"," ")}</small><button type="button" className="wp-photo-action" disabled={photoBusy || !user?.id} onClick={() => photoPicker.current?.click()}>{photoBusy ? "Saving photo…" : "Change photo"}</button><input ref={photoPicker} className="wp-photo-picker" type="file" accept="image/*" aria-label="Choose profile photo" onChange={(event) => { void updatePhoto(event.target.files?.[0]); }} /></div></section>
      {loading && !user ? <section className="wp-card" aria-live="polite">Opening your profile…</section> : <>
        <nav className="wp-tabs" aria-label="Profile sections">
          <button type="button" aria-current={tab === "details" ? "page" : undefined} onClick={() => {setTab("details");setError("");setNotice("");}}>Personal details</button>
          <button type="button" aria-current={tab === "email" ? "page" : undefined} onClick={() => {setTab("email");setError("");setNotice("");}}>Email</button>
          <button type="button" aria-current={tab === "password" ? "page" : undefined} onClick={() => {setTab("password");setError("");setNotice("");}}>Password</button>
        </nav>
        {notice && <p className="wp-notice" role="status">{notice}</p>}
        {error && <p className="wp-error" role="alert">{error}</p>}
        {tab === "details" && <form className="wp-card" onSubmit={submitDetails}><label>Full name<input required value={form.fullName} onChange={e=>setForm(v=>({...v,fullName:e.target.value}))}/></label><label>Phone<input type="tel" value={form.phone} onChange={e=>setForm(v=>({...v,phone:e.target.value}))}/></label><label>Preferred locale<input value={form.preferredLocale} onChange={e=>setForm(v=>({...v,preferredLocale:e.target.value}))}/></label><button disabled={saving || loading}>Save details</button></form>}
        {tab === "email" && <form className="wp-card" onSubmit={submitEmail}><label>Login email<input type="email" autoComplete="email" required value={email.newEmail} onChange={e=>setEmail(v=>({...v,newEmail:e.target.value}))}/></label><label>Current password<input type="password" autoComplete="current-password" required value={email.currentPassword} onChange={e=>setEmail(v=>({...v,currentPassword:e.target.value}))}/></label><button disabled={saving || loading}>Change email</button></form>}
        {tab === "password" && <form className="wp-card" onSubmit={submitPassword}><label>Current password<input type="password" autoComplete="current-password" required value={password.currentPassword} onChange={e=>setPassword(v=>({...v,currentPassword:e.target.value}))}/></label><label>New password<input type="password" autoComplete="new-password" required value={password.newPassword} onChange={e=>setPassword(v=>({...v,newPassword:e.target.value}))}/></label><label>Confirm password<input type="password" autoComplete="new-password" required value={password.confirmPassword} onChange={e=>setPassword(v=>({...v,confirmPassword:e.target.value}))}/></label><button disabled={saving || loading}>Change password</button></form>}
      </>}
    </div>
  </main>;
}
const css = `.wp-identity-copy{min-width:0;flex:1}.wp-avatar{flex:0 0 58px;width:58px;height:58px;overflow:hidden}.wp-avatar img{width:100%;height:100%;object-fit:cover}.wp-photo-action{margin-top:8px;border:1px solid var(--border,#d8dee9);border-radius:9px;background:var(--surface,#fff);color:inherit;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer}.wp-photo-action:disabled{opacity:.55}.wp-photo-picker{display:none!important}
.wp-page{min-height:100dvh;padding:16px;background:var(--bg,var(--background,#f4f6f9));color:var(--text,#172033);font-family:inherit}.wp-container{width:min(720px,100%);margin:0 auto;display:grid;gap:14px}.wp-header{display:flex;gap:14px;align-items:center}.wp-header button,.wp-tabs button{background:var(--surface,#fff);border:1px solid var(--border,#d8dee9);border-radius:12px;color:inherit;padding:10px;cursor:pointer}.wp-header h1{font-size:21px;margin:0}.wp-header p{font-size:12px;color:var(--muted,#64748b);margin:4px 0}.wp-identity,.wp-card{border:1px solid var(--border,#d8dee9);background:var(--surface,#fff);border-radius:15px;padding:16px}.wp-identity{display:flex;align-items:center;gap:12px}.wp-avatar{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;background:color-mix(in srgb,var(--primary-color,#2563eb) 12%,var(--surface,#fff));font-size:21px;font-weight:800}.wp-identity strong,.wp-identity small{display:block}.wp-identity small{color:var(--muted,#64748b);margin-top:3px;overflow-wrap:anywhere}.wp-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.wp-tabs button[aria-current=page]{border-color:var(--primary-color,#2563eb);font-weight:800}.wp-card{display:grid;gap:15px}.wp-card label{display:grid;gap:6px;font-size:12px;font-weight:700}.wp-card input{background:var(--surface,#fff);color:inherit;border:1px solid var(--border,#d8dee9);border-radius:10px;padding:11px;min-width:0;font:inherit}.wp-card button{background:var(--primary-color,#2563eb);color:#fff;border:0;border-radius:10px;padding:11px;font-weight:800;cursor:pointer}.wp-card button:disabled{opacity:.6}.wp-notice,.wp-error{padding:12px;border-radius:10px;background:var(--surface,#fff);font-size:13px}.wp-notice{border:1px solid var(--border,#d8dee9)}.wp-error{border:1px solid #dc2626;color:#dc2626}@media(max-width:380px){.wp-page{padding:8px}.wp-tabs button{font-size:11px;padding:9px 3px}}`;
