"use client";

/**
 * app/components/role-portals/LocalSettings.tsx
 * ---------------------------------------------------------
 * ELEEVEON LOCAL SETTINGS — BRANCH SETTINGS COMPACT UI
 * ---------------------------------------------------------
 *
 * Drop-in replacement.
 *
 * What this file does:
 * - Controls local, per-browser display preferences for a portal.
 * - Keeps school and branch branding protected.
 * - Saves local preferences in localStorage.
 * - Applies each local preference immediately and publishes it for LocalAppearanceRuntime.
 * - The runtime applies the exact historical LocalSettings light/dark palette.
 *
 * Preserved behavior:
 * - Same exported types.
 * - Helper functions are re-exported from localPortalAppearance.
 * - Same localStorage key pattern.
 * - Same appearance modes: light, dark, system.
 * - Same local font-size comfort controls.
 * - Same compact/comfortable density control.
 * - Same reduced-motion control.
 * - Same local settings change events.
 *
 * UI rewrite:
 * - Removed the large CourseOutline-style detail card.
 * - Removed the selected detail panel.
 * - Removed connection-map preview blocks.
 * - Removed "Current Local Setup" card.
 * - Removed big decorative choice cards.
 * - Uses BranchSettings compact pattern instead:
 *   - compact top row
 *   - compact settings rows on mobile
 *   - responsive multi-card grid on tablet and desktop
 *   - tap a row/card to open a bottom sheet
 *   - compact form/list options inside sheets
 *   - reset and details moved to More sheet
 *
 * Important:
 * Local users cannot edit:
 * - branch primary color
 * - logo
 * - school identity
 * - branch identity
 * - branch font family
 * - dashboard/report branding
 */

import React, { useEffect, useMemo, useState } from "react";

// ======================================================
// DEVICE-LOCAL APPEARANCE CONTRACT
// ======================================================

import {
  applyLocalPortalSettings,
  announceLocalSettingsChange,
  clearLocalPortalSettings,
  DEFAULT_LOCAL_PORTAL_SETTINGS,
  getLocalSettingsStorageKey,
  readLocalPortalSettings,
  resolveLocalAppearance,
  resolveLocalFontSize,
  resolveSharedFontSize,
  saveLocalPortalSettings,
  type LocalAppearanceMode,
  type LocalDensity,
  type LocalFontSize,
  type LocalPortalSettings,
} from "../../lib/theme/localPortalAppearance";

export {
  applyLocalPortalSettings,
  announceLocalSettingsChange,
  clearLocalPortalSettings,
  DEFAULT_LOCAL_PORTAL_SETTINGS,
  getLocalSettingsStorageKey,
  readLocalPortalSettings,
  resolveLocalAppearance,
  resolveLocalFontSize,
  resolveSharedFontSize,
  saveLocalPortalSettings,
};

export type {
  LocalAppearanceMode,
  LocalDensity,
  LocalFontSize,
  LocalPortalSettings,
};

type Props = {
  portalName?: string;
  roleKey?: string;
  accountId?: string | null;
  schoolId?: number | string | null;
  branchId?: number | string | null;

  /**
   * Shared branding colour. It is used by this settings UI only and is never
   * changed by a local preference.
   */
  primaryColor?: string;

  /** Shared role/branch font size used by the "Branch Default" option. */
  branchFontSize?: number | string | null;

  /**
   * Shared branch/account/platform default mode. Local "system" follows this.
   */
  sharedDefaultMode?: "light" | "dark" | string | null;

  triggerLabel?: string;
  triggerIcon?: string;
  inline?: boolean;
  onChange?: (
    settings: LocalPortalSettings,
  ) => void;
};

type CssVars =
  React.CSSProperties & {
    "--ba-primary"?: string;
  };

type SettingsSection =
  | "appearance"
  | "text"
  | "density"
  | "motion";

type Tone =
  | "green"
  | "red"
  | "blue"
  | "gray"
  | "orange"
  | "purple";

// ======================================================
// COMPONENT
// ======================================================

export default function LocalSettings({
  portalName = "Portal",
  roleKey = "portal",
  accountId,
  schoolId,
  branchId,
  triggerLabel = "Local Settings",
  triggerIcon = "⚙️",
  inline = false,
  primaryColor = "var(--primary-color, #2563eb)",
  branchFontSize,
  sharedDefaultMode = "light",
  onChange,
}: Props) {
  const storageKey = useMemo(
    () => getLocalSettingsStorageKey({ accountId, schoolId, branchId, roleKey }),
    [accountId, schoolId, branchId, roleKey]
  );

  const [open, setOpen] = useState(inline);
  const [search, setSearch] = useState("");
  const [sectionOpen, setSectionOpen] = useState<SettingsSection | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  /**
   * Apply locally first, then notify the global runtime.
   *
   * This makes Light/Dark/Portal Default switch immediately even when the
   * global runtime is remounting, changing workspace, or handling another
   * appearance event at the same moment.
   */
  const applyAndAnnounce = (
    next: LocalPortalSettings,
  ) => {
    applyLocalPortalSettings(
      next,
      {
        sharedDefaultMode,
        sharedPrimaryColor:
          primaryColor,
        sharedFontSize:
          branchFontSize,
      },
    );

    announceLocalSettingsChange(
      storageKey,
      next,
      {
        sharedDefaultMode,
        sharedPrimaryColor:
          primaryColor,
        sharedFontSize:
          branchFontSize,
      },
    );

    onChange?.(next);
  };

  const [settings, setSettings] =
    useState<LocalPortalSettings>(
      () =>
        readLocalPortalSettings(
          storageKey,
        ),
    );

  /**
   * A mounted portal can switch role, school, or branch without unmounting this
   * component. Reload the settings for the new exact storage key and apply them.
   */
  useEffect(() => {
    const loaded =
      readLocalPortalSettings(
        storageKey,
      );

    setSettings(loaded);

    applyLocalPortalSettings(
      loaded,
      {
        sharedDefaultMode,
        sharedPrimaryColor:
          primaryColor,
        sharedFontSize:
          branchFontSize,
      },
    );
  }, [
    storageKey,
    sharedDefaultMode,
    primaryColor,
    branchFontSize,
  ]);

  const updateSettings = (patch: Partial<LocalPortalSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveLocalPortalSettings(storageKey, next);
    applyAndAnnounce(next);
  };

  const resetSettings = () => {
    clearLocalPortalSettings(storageKey);
    setSettings(DEFAULT_LOCAL_PORTAL_SETTINGS);
    saveLocalPortalSettings(storageKey, DEFAULT_LOCAL_PORTAL_SETTINGS);
    applyAndAnnounce(DEFAULT_LOCAL_PORTAL_SETTINGS);
  };

  const resolvedAppearance =
    resolveLocalAppearance(
      settings.appearanceMode,
      sharedDefaultMode,
    );

  const rows = useMemo(() => {
    const items: Array<{
      key: SettingsSection;
      icon: string;
      title: string;
      subtitle: string;
      detail: string;
      tone: Tone;
    }> = [
      {
        key: "appearance",
        icon: "◐",
        title: "Appearance",
        subtitle: `${labelFromDash(settings.appearanceMode)} · ${labelFromDash(resolvedAppearance)}`,
        detail: "Light, dark, or portal default",
        tone: resolvedAppearance === "dark" ? "orange" : "green",
      },
      {
        key: "text",
        icon: "Aa",
        title: "Text Size",
        subtitle: settings.fontSize === "branch" ? "Branch default" : labelFromDash(settings.fontSize),
        detail: `Current size: ${resolveLocalFontSize(settings.fontSize, branchFontSize)}`,
        tone: "blue",
      },
      {
        key: "density",
        icon: "▦",
        title: "Layout Density",
        subtitle: labelFromDash(settings.density),
        detail: settings.density === "compact" ? "Tighter spacing" : "Comfortable spacing",
        tone: settings.density === "compact" ? "purple" : "green",
      },
      {
        key: "motion",
        icon: "≈",
        title: "Motion",
        subtitle: settings.reduceMotion ? "Reduced" : "Normal",
        detail: settings.reduceMotion ? "Animations minimized" : "Animations enabled",
        tone: settings.reduceMotion ? "orange" : "gray",
      },
    ];

    const term = search.trim().toLowerCase();
    if (!term) return items;

    return items.filter((item) =>
      `${item.title} ${item.subtitle} ${item.detail}`.toLowerCase().includes(term)
    );
  }, [branchFontSize, resolvedAppearance, search, settings]);

  const content = (
    <main className="ba-page local-settings-page" style={{ "--ba-primary": primaryColor } as CssVars}>
      <section className="ba-search-card" aria-label="Local settings search and actions">
        <label className="ba-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search settings..."
            aria-label="Search local settings"
          />
        </label>

        <button
          type="button"
          className="ba-add-inline"
          onClick={resetSettings}
          aria-label="Reset local settings"
          title="Reset"
        >
          Reset
        </button>

        <button type="button" className="ba-icon-button" onClick={() => setMoreOpen(true)} aria-label="More options">
          ⋯
        </button>

        {!inline && (
          <button type="button" className="ba-icon-button local-close-button" onClick={() => setOpen(false)} aria-label="Close local settings">
            ✕
          </button>
        )}
      </section>

      <section className="ba-list local-settings-list" aria-label={`${portalName} local settings`}>
        {rows.map((row) => (
          <button key={row.key} type="button" className="student-row" onClick={() => setSectionOpen(row.key)}>
            <span className="local-row-icon">{row.icon}</span>

            <span className="student-main">
              <strong>{row.title}</strong>
              <small>{row.subtitle}</small>
              <em>{row.detail}</em>
            </span>

            <span className="student-side">
              <span className={`status-dot-mini ${row.tone}`} />
              <i>⋯</i>
            </span>
          </button>
        ))}

        {!rows.length && (
          <section className="ba-empty">
            <div className="ba-empty-icon">⚙️</div>
            <h3>No settings found</h3>
            <p>Try another search term or open More for current setup details.</p>
          </section>
        )}
      </section>

      {sectionOpen === "appearance" && (
        <AppearanceSheet
          value={settings.appearanceMode}
          resolvedAppearance={resolvedAppearance}
          onChange={(appearanceMode) => updateSettings({ appearanceMode })}
          onClose={() => setSectionOpen(null)}
        />
      )}

      {sectionOpen === "text" && (
        <TextSizeSheet
          value={settings.fontSize}
          branchFontSize={branchFontSize}
          onChange={(fontSize) => updateSettings({ fontSize })}
          onClose={() => setSectionOpen(null)}
        />
      )}

      {sectionOpen === "density" && (
        <DensitySheet
          value={settings.density}
          onChange={(density) => updateSettings({ density })}
          onClose={() => setSectionOpen(null)}
        />
      )}

      {sectionOpen === "motion" && (
        <MotionSheet
          value={settings.reduceMotion}
          onChange={(reduceMotion) => updateSettings({ reduceMotion })}
          onClose={() => setSectionOpen(null)}
        />
      )}

      {moreOpen && (
        <MoreSheet
          portalName={portalName}
          roleKey={roleKey}
          settings={settings}
          resolvedAppearance={resolvedAppearance}
          storageKey={storageKey}
          resetSettings={() => {
            resetSettings();
            setMoreOpen(false);
          }}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </main>
  );

  return (
    <div className="ba-local-root" style={{ "--ba-primary": primaryColor } as CssVars}>
      <style>{css}</style>

      {!inline && (
        <button type="button" className="ba-local-trigger" onClick={() => setOpen(true)}>
          <span>{triggerIcon}</span>
          {triggerLabel}
        </button>
      )}

      {inline && content}

      {!inline && open && (
        <div className="ba-sheet-backdrop local-layer" role="dialog" aria-modal="true" aria-label={`${portalName} local settings`}>
          <button type="button" className="local-overlay" aria-label="Close local settings" onClick={() => setOpen(false)} />
          <div className="local-panel">{content}</div>
        </div>
      )}
    </div>
  );
}

// ======================================================
// COMPACT SHEETS
// ======================================================

function AppearanceSheet({
  value,
  resolvedAppearance,
  onChange,
  onClose,
}: {
  value: LocalAppearanceMode;
  resolvedAppearance: "light" | "dark";
  onChange: (value: LocalAppearanceMode) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Appearance" text={`Current resolved mode: ${labelFromDash(resolvedAppearance)}.`} onClose={onClose}>
      <div className="ba-menu-list">
        <OptionRow active={value === "light"} icon="☀" title="Light" note="Use old light mode" onClick={() => onChange("light")} />
        <OptionRow active={value === "dark"} icon="☾" title="Dark" note="Use protected branch dark mode" onClick={() => onChange("dark")} />
        <OptionRow active={value === "system"} icon="▣" title="Portal Default" note="Follow the branch, account, or platform default" onClick={() => onChange("system")} />
      </div>

      <div className="ba-sheet-actions">
        <button type="button" className="primary" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}

function TextSizeSheet({
  value,
  branchFontSize,
  onChange,
  onClose,
}: {
  value: LocalFontSize;
  branchFontSize?: number | string | null;
  onChange: (value: LocalFontSize) => void;
  onClose: () => void;
}) {
  const options: Array<{ value: LocalFontSize; title: string; note: string }> = [
    { value: "branch", title: "Branch Default", note: `Uses ${resolveSharedFontSize(branchFontSize)}` },
    { value: "small", title: "Small", note: "12px" },
    { value: "normal", title: "Normal", note: "14px" },
    { value: "large", title: "Large", note: "18px" },
    { value: "extra-large", title: "Extra Large", note: "20px" },
  ];

  return (
    <Sheet title="Text Size" text="Change only your local reading size." onClose={onClose}>
      <div className="ba-menu-list">
        {options.map((option) => (
          <OptionRow
            key={option.value}
            active={value === option.value}
            icon="Aa"
            title={option.title}
            note={option.note}
            onClick={() => onChange(option.value)}
          />
        ))}
      </div>

      <div className="ba-sheet-actions">
        <button type="button" className="primary" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}

function DensitySheet({
  value,
  onChange,
  onClose,
}: {
  value: LocalDensity;
  onChange: (value: LocalDensity) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Layout Density" text="Choose how much spacing the portal uses locally." onClose={onClose}>
      <div className="ba-menu-list">
        <OptionRow active={value === "comfortable"} icon="▢" title="Comfortable" note="More spacing, easier reading" onClick={() => onChange("comfortable")} />
        <OptionRow active={value === "compact"} icon="▥" title="Compact" note="Less spacing, more data visible" onClick={() => onChange("compact")} />
      </div>

      <div className="ba-sheet-actions">
        <button type="button" className="primary" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}

function MotionSheet({
  value,
  onChange,
  onClose,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Motion" text="Control animations on this device." onClose={onClose}>
      <div className="ba-menu-list">
        <OptionRow active={!value} icon="≈" title="Normal Motion" note="Animations enabled" onClick={() => onChange(false)} />
        <OptionRow active={value} icon="—" title="Reduce Motion" note="Minimize animations" onClick={() => onChange(true)} />
      </div>

      <div className="ba-sheet-actions">
        <button type="button" className="primary" onClick={onClose}>Done</button>
      </div>
    </Sheet>
  );
}

function MoreSheet({
  portalName,
  roleKey,
  settings,
  resolvedAppearance,
  storageKey,
  resetSettings,
  onClose,
}: {
  portalName: string;
  roleKey: string;
  settings: LocalPortalSettings;
  resolvedAppearance: "light" | "dark";
  storageKey: string;
  resetSettings: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="More" text="Local display details and reset action." onClose={onClose} small>
      <div className="local-info-list">
        <InfoLine label="Portal" value={`${portalName} · ${roleKey}`} />
        <InfoLine label="Appearance" value={`${settings.appearanceMode} / ${resolvedAppearance}`} />
        <InfoLine label="Text" value={settings.fontSize} />
        <InfoLine label="Density" value={settings.density} />
        <InfoLine label="Motion" value={settings.reduceMotion ? "Reduced" : "Normal"} />
      </div>

      <div className="ba-menu-list">
        <button type="button" onClick={resetSettings}>
          <span>↺</span>
          <b>Reset local preferences</b>
          <small>Return this portal to branch defaults</small>
        </button>
        <button type="button" onClick={onClose}>
          <span>✓</span>
          <b>Keep current setup</b>
          <small>{storageKey}</small>
        </button>
      </div>
    </Sheet>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function Sheet({
  title,
  text,
  children,
  onClose,
  small = false,
}: {
  title: string;
  text: string;
  children: React.ReactNode;
  onClose: () => void;
  small?: boolean;
}) {
  return (
    <div className="ba-sheet-backdrop" role="dialog" aria-modal="true">
      <section className={`ba-sheet ${small ? "small" : ""}`}>
        <div className="ba-sheet-head">
          <div>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={`Close ${title}`}>✕</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function OptionRow({
  active,
  icon,
  title,
  note,
  onClick,
}: {
  active: boolean;
  icon: string;
  title: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={active ? "active" : ""} onClick={onClick}>
      <span>{active ? "✓" : icon}</span>
      <b>{title}</b>
      <small>{note}</small>
    </button>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function labelFromDash(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// ======================================================
// CSS — BRANCH SETTINGS COMPACT STYLE
// ======================================================

const css = `
@keyframes spin{to{transform:rotate(360deg)}}

.ba-local-root{
  width:100%;
  max-width:100%;
  min-width:0;
  color:var(--text,#111827);
  font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);
}

.ba-local-root *,
.ba-local-root *::before,
.ba-local-root *::after{
  box-sizing:border-box;
  min-width:0;
}

.ba-local-root button,
.ba-local-root input,
.ba-local-root select,
.ba-local-root textarea{
  font:inherit;
  max-width:100%;
}

.ba-local-root button{
  -webkit-tap-highlight-color:transparent;
}

.ba-local-trigger{
  min-height:42px;
  display:inline-flex;
  align-items:center;
  gap:8px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:999px;
  padding:0 14px;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#111827);
  font-size:13px;
  font-weight:950;
  cursor:pointer;
  box-shadow:0 12px 28px rgba(15,23,42,.06);
}

.ba-local-trigger span{
  width:24px;
  height:24px;
  display:grid;
  place-items:center;
  border-radius:999px;
  background:color-mix(in srgb,var(--ba-primary) 11%,transparent);
  color:var(--ba-primary);
}

.ba-page{
  --ease:cubic-bezier(.2,.8,.2,1);
  min-height:100dvh;
  width:100%;
  max-width:100%;
  min-width:0;
  padding:calc(8px * var(--local-density-scale,1));
  padding-bottom:max(40px,env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left,color-mix(in srgb,var(--ba-primary) 9%,transparent),transparent 30rem),
    var(--bg,#f7f8fb);
  color:var(--text,#111827);
  font-family:var(--font-family,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);
  font-size:var(--font-size,14px);
  overflow-x:hidden;
}

.local-settings-page{
  min-height:100%;
}

.ba-page input,
.ba-page select,
.ba-page textarea{
  width:100%;
  min-height:44px;
  border:1px solid var(--input-border,var(--border,rgba(0,0,0,.10)));
  border-radius:16px;
  padding:0 12px;
  background:var(--input-bg,var(--surface,#fff));
  color:var(--input-text,var(--text,#111827));
  outline:none;
  font-weight:750;
}

.ba-page input:focus,
.ba-page select:focus,
.ba-page textarea:focus{
  border-color:color-mix(in srgb,var(--ba-primary) 52%,var(--border,rgba(0,0,0,.10)));
  box-shadow:0 0 0 4px color-mix(in srgb,var(--ba-primary) 12%,transparent);
}

.ba-search-card,
.student-row,
.ba-empty,
.ba-sheet{
  background:var(--card-bg,var(--surface,#fff));
  border:1px solid var(--border,rgba(0,0,0,.10));
  box-shadow:0 12px 28px rgba(15,23,42,.045);
}

.ba-search-card{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto auto;
  gap:8px;
  align-items:center;
  margin-top:2px;
  padding:8px;
  border-radius:24px;
}

.local-close-button{
  display:none!important;
}

.ba-search{
  min-width:0;
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  align-items:center;
  gap:8px;
  min-height:44px;
  padding:0 11px;
  border-radius:18px;
  background:color-mix(in srgb,var(--muted,#64748b) 7%,transparent);
}

.ba-search span{
  color:var(--muted,#64748b);
  font-size:17px;
  font-weight:1000;
}

.ba-search input{
  min-height:42px;
  border:0;
  padding:0;
  border-radius:0;
  background:transparent;
  box-shadow:none;
  font-size:14px;
}

.ba-add-inline,
.ba-icon-button{
  min-width:42px;
  height:42px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:999px;
  display:grid;
  place-items:center;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#111827);
  font-size:14px;
  font-weight:1000;
  cursor:pointer;
  box-shadow:0 10px 22px rgba(15,23,42,.045);
}

.ba-add-inline{
  padding:0 13px;
  background:var(--ba-primary);
  border-color:var(--ba-primary);
  color:#fff;
  font-size:12px;
}

.ba-icon-button{
  width:42px;
  font-size:18px;
}

.ba-list{
  display:grid;
  gap:7px;
  margin-top:10px;
}

.student-row{
  width:100%;
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto;
  align-items:center;
  gap:10px;
  padding:10px;
  border-radius:22px;
  text-align:left;
  color:var(--text,#111827);
  cursor:pointer;
  transition:transform .16s var(--ease),border-color .16s var(--ease),box-shadow .16s var(--ease);
}

.student-row:hover{
  transform:translateY(-1px);
  border-color:color-mix(in srgb,var(--ba-primary) 26%,var(--border,rgba(0,0,0,.10)));
}

.local-row-icon{
  width:40px;
  height:40px;
  display:grid;
  place-items:center;
  border-radius:16px;
  background:linear-gradient(135deg,var(--ba-primary),rgba(15,23,42,.9));
  color:#fff;
  font-size:13px;
  font-weight:1000;
  box-shadow:0 12px 24px rgba(15,23,42,.12);
}

.student-main{
  display:grid;
  gap:2px;
  min-width:0;
}

.student-main strong,
.student-main small,
.student-main em{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.student-main strong{
  font-size:14px;
  font-weight:1000;
  color:var(--text,#111827);
}

.student-main small{
  color:var(--muted,#64748b);
  font-size:11px;
  font-weight:850;
}

.student-main em{
  color:var(--muted,#64748b);
  font-size:11px;
  font-style:normal;
  font-weight:750;
}

.student-side{
  display:flex;
  align-items:center;
  gap:8px;
}

.student-side i{
  color:var(--muted,#64748b);
  font-style:normal;
  font-size:18px;
  font-weight:1000;
}

.status-dot-mini{
  width:9px;
  height:9px;
  border-radius:999px;
  background:var(--muted,#64748b);
  box-shadow:0 0 0 4px color-mix(in srgb,var(--muted,#64748b) 12%,transparent);
}

.status-dot-mini.green{background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.13)}
.status-dot-mini.red{background:#ef4444;box-shadow:0 0 0 4px rgba(239,68,68,.13)}
.status-dot-mini.orange{background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.15)}
.status-dot-mini.blue{background:#3b82f6;box-shadow:0 0 0 4px rgba(59,130,246,.13)}
.status-dot-mini.purple{background:#9333ea;box-shadow:0 0 0 4px rgba(147,51,234,.13)}
.status-dot-mini.gray{background:var(--muted,#64748b)}

.ba-empty{
  border-radius:24px;
  padding:18px;
  text-align:center;
}

.ba-empty-icon{
  width:44px;
  height:44px;
  margin:0 auto 8px;
  display:grid;
  place-items:center;
  border-radius:18px;
  background:color-mix(in srgb,var(--ba-primary) 10%,transparent);
  color:var(--ba-primary);
  font-size:20px;
}

.ba-empty h3{
  margin:0;
  font-size:16px;
  font-weight:1000;
}

.ba-empty p{
  margin:5px 0 0;
  color:var(--muted,#64748b);
  font-size:12px;
  line-height:1.5;
}

.ba-sheet-backdrop{
  position:fixed;
  inset:0;
  z-index:80;
  background:rgba(2,6,23,.46);
  display:grid;
  align-items:end;
  padding:10px;
}

.local-layer{
  align-items:center;
  justify-items:center;
}

.local-overlay{
  position:absolute;
  inset:0;
  border:0;
  background:transparent;
  cursor:pointer;
}

.local-panel{
  position:relative;
  z-index:1;
  width:min(520px,100%);
  max-height:min(92dvh,760px);
  overflow:auto;
  border-radius:30px;
  background:var(--bg,#f7f8fb);
  box-shadow:0 30px 90px rgba(0,0,0,.30);
}

.local-panel .ba-page{
  min-height:auto;
}

.ba-sheet{
  width:min(540px,100%);
  margin:0 auto;
  border-radius:28px 28px 20px 20px;
  padding:14px;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#111827);
}

.ba-sheet.small{
  width:min(440px,100%);
}

.ba-sheet-head{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:12px;
  margin-bottom:12px;
}

.ba-sheet-head h2{
  margin:0;
  font-size:20px;
  font-weight:1000;
  letter-spacing:-.04em;
}

.ba-sheet-head p{
  margin:3px 0 0;
  color:var(--muted,#64748b);
  font-size:12px;
  font-weight:750;
  line-height:1.45;
}

.ba-sheet-head button{
  width:38px;
  height:38px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:999px;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#111827);
  font-weight:1000;
  cursor:pointer;
}

.ba-menu-list{
  display:grid;
  gap:8px;
}

.ba-menu-list button{
  width:100%;
  display:grid;
  grid-template-columns:auto minmax(0,1fr);
  grid-template-rows:auto auto;
  column-gap:10px;
  text-align:left;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:18px;
  padding:10px;
  background:color-mix(in srgb,var(--muted,#64748b) 5%,transparent);
  color:var(--text,#111827);
  cursor:pointer;
}

.ba-menu-list button.active{
  border-color:var(--ba-primary);
  background:color-mix(in srgb,var(--ba-primary) 11%,transparent);
}

.ba-menu-list span{
  grid-row:1 / span 2;
  width:32px;
  height:32px;
  border-radius:13px;
  display:grid;
  place-items:center;
  background:color-mix(in srgb,var(--ba-primary) 12%,transparent);
  color:var(--ba-primary);
  font-weight:1000;
}

.ba-menu-list b{
  font-size:13px;
  font-weight:1000;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.ba-menu-list small{
  color:var(--muted,#64748b);
  font-size:10px;
  font-weight:800;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.local-info-list{
  display:grid;
  gap:7px;
  margin-bottom:10px;
}

.local-info-list div{
  display:flex;
  justify-content:space-between;
  gap:10px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:15px;
  padding:9px 10px;
  background:color-mix(in srgb,var(--muted,#64748b) 5%,transparent);
}

.local-info-list span{
  color:var(--muted,#64748b);
  font-size:11px;
  font-weight:900;
}

.local-info-list strong{
  color:var(--text,#111827);
  font-size:11px;
  font-weight:1000;
  text-align:right;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.ba-sheet-actions{
  display:flex;
  justify-content:flex-end;
  gap:8px;
  margin-top:12px;
}

.ba-sheet-actions button{
  min-height:40px;
  border:1px solid var(--border,rgba(0,0,0,.10));
  border-radius:999px;
  padding:0 14px;
  background:var(--card-bg,var(--surface,#fff));
  color:var(--text,#111827);
  font-size:12px;
  font-weight:950;
  cursor:pointer;
}

.ba-sheet-actions button.primary{
  border-color:var(--ba-primary);
  background:var(--ba-primary);
  color:#fff;
}

@media (max-width:520px){
  .ba-search-card{
    grid-template-columns:minmax(0,1fr) auto auto;
  }

  .local-panel{
    width:100%;
    max-height:94dvh;
    border-radius:24px;
  }

  .ba-sheet-backdrop{
    padding:8px;
  }

  .student-row{
    padding:9px;
  }

  .local-row-icon{
    width:38px;
    height:38px;
    border-radius:15px;
  }
}

@media (min-width:720px){
  .ba-page{
    padding:10px;
  }

  .local-panel{
    width:min(760px,100%);
  }

  .local-settings-list{
    grid-template-columns:repeat(2,minmax(0,1fr));
    align-items:stretch;
  }

  .student-row{
    height:100%;
    min-height:86px;
  }
}

@media (min-width:1080px){
  .local-panel{
    width:min(980px,100%);
  }

  .local-settings-list{
    grid-template-columns:repeat(3,minmax(0,1fr));
  }
}

@media (prefers-reduced-motion:reduce){
  .student-row{
    transition:none!important;
  }

  .student-row:hover{
    transform:none!important;
  }
}
`;