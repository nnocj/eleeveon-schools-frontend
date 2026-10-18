"use client";

import { useEffect, useState, type ReactNode } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type Props = {
  title?: string;
  detail?: string;
  children?: ReactNode;
  loading?: boolean;
};

function installedMode() {
  if (typeof window === "undefined") return false;
  const ios = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    Boolean(ios.standalone);
}

function installInstructions(): string {
  if (typeof navigator === "undefined") return "Use your browser's Install app or Add to Home Screen option.";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) {
    return "On iPhone/iPad: open this page in Safari, tap Share, then choose Add to Home Screen (or Add to Dock, where offered).";
  }
  if (/Android/i.test(ua)) {
    return "On Android: open this page in Chrome or another installation-capable browser, open the browser menu, then choose Install app or Add to Home Screen. Some browsers only create shortcuts.";
  }
  return "On desktop: use your browser's Install app icon in the address bar, or the browser menu's Install app option. Browser support varies.";
}

export default function OfflineLaunchScreen({
  title = "Opening your workspace…",
  detail = "Restoring your last Eleeveon workspace from this device.",
  children,
  loading = true,
}: Props) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState<string | null>(null);

  useEffect(() => {
    setIsInstalled(installedMode());
    const capture = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const completed = () => {
      setIsInstalled(true);
      setPromptEvent(null);
      setInstallMessage("Eleeveon Schools was installed.");
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", completed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", completed);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) {
      setInstructionsOpen(true);
      return;
    }
    setInstalling(true);
    setInstallMessage(null);
    try {
      // Browser installation prompt only works in a direct user gesture.
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setPromptEvent(null);
      if (choice.outcome === "dismissed") {
        setInstallMessage("Installation was cancelled. You can use your browser's installation menu instead.");
      }
    } catch {
      setInstructionsOpen(true);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <main className="eleeveon-launch">
      <section className="eleeveon-launch-card" aria-label="Eleeveon Schools launcher">
        {/* Uses the EXISTING Eleeveon branded PWA icon supplied in public/icons. */}
        <img className="eleeveon-launch-logo" src="/icons/icon-192.png" width="90" height="90" alt="Eleeveon Schools logo" />
        <strong className="eleeveon-launch-brand">Eleeveon Schools</strong>
        {loading && <div className="eleeveon-launch-spinner" role="status" aria-label="Preparing workspace" />}
        <h1>{title}</h1>
        <p>{detail}</p>
        {children}
        {!isInstalled && (
          <div className="eleeveon-install-section">
            <button type="button" className="eleeveon-install-button" disabled={installing} onClick={() => void install()}>
              {installing ? "Opening install prompt…" : "↓ Install Eleeveon Schools"}
            </button>
            <button type="button" className="eleeveon-instructions-button" onClick={() => setInstructionsOpen((v) => !v)}>
              {instructionsOpen ? "Hide installation instructions" : "How to install on my device"}
            </button>
            {instructionsOpen && <p className="eleeveon-install-help">{installInstructions()}</p>}
            {installMessage && <p className="eleeveon-install-help" role="status">{installMessage}</p>}
          </div>
        )}
        <small>Offline school records on this device are preserved.</small>
      </section>
      <style>{`
        .eleeveon-launch{min-height:100dvh;background:var(--bg,#f8fafc);color:var(--text,#0f172a);display:grid;place-items:center;padding:20px}
        .eleeveon-launch-card{width:min(410px,100%);display:grid;justify-items:center;text-align:center;gap:13px;padding:20px}
        .eleeveon-launch-logo{width:90px;height:90px;object-fit:contain;border-radius:20px}
        .eleeveon-launch-brand{font-size:20px;letter-spacing:-.03em}
        .eleeveon-launch-card h1{font-size:18px;margin:0}
        .eleeveon-launch-card p{font-size:13px;line-height:1.6;color:var(--muted,#64748b);margin:0}
        .eleeveon-launch-card small{color:var(--muted,#64748b);font-size:11px}
        .eleeveon-launch-spinner{width:27px;height:27px;border:3px solid #dbeafe;border-top-color:var(--primary-color,#2563eb);border-radius:50%;animation:eleeveon-launch-spin .85s linear infinite}
        .eleeveon-install-section{display:grid;gap:10px;justify-items:center;width:100%;margin-top:7px}
        .eleeveon-install-button{width:100%;max-width:320px;min-height:45px;padding:10px 16px;background:var(--primary-color,#2563eb);color:#fff;border:0;border-radius:13px;font:inherit;font-size:14px;font-weight:750;cursor:pointer}
        .eleeveon-install-button:disabled{opacity:.65;cursor:wait}
        .eleeveon-instructions-button{border:0;background:none;color:var(--primary-color,#2563eb);font:inherit;font-size:12px;font-weight:700;text-decoration:underline;cursor:pointer}
        .eleeveon-launch-card .eleeveon-install-help{font-size:12px;text-align:left;padding:12px;background:var(--surface,#fff);border:1px solid #d7dfec;border-radius:12px;width:100%}
        @keyframes eleeveon-launch-spin{to{transform:rotate(360deg)}}
        @media(prefers-reduced-motion:reduce){.eleeveon-launch-spinner{animation:none}}
      `}</style>
    </main>
  );
}
