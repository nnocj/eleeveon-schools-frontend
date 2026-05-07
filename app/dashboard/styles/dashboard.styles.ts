// ================= LAYOUT =================
export const layout = {
  container: {
    display: "flex",
    height: "100vh",
    fontFamily: "system-ui, -apple-system, sans-serif",

    background: "var(--bg)",
    color: "var(--text)",
  } as React.CSSProperties,

  main: {
    flex: 1,
    padding: 24,
    overflowY: "auto",

    background: "var(--bg)",
  } as React.CSSProperties,

  topbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,

    marginBottom: 24,
  } as React.CSSProperties,

  // 🔥 HAMBURGER (IMPROVED)
  hamburger: (isMobile: boolean) =>
    ({
      padding: "8px 12px",
      fontSize: 18,
      borderRadius: 10,
      cursor: "pointer",

      background: "var(--surface)",
      border: "1px solid rgba(0,0,0,0.08)",
      color: "var(--text)",

      boxShadow: "0 2px 6px rgba(0,0,0,0.05)",

      transition: "0.2s ease",

      filter: isMobile ? "brightness(1.3)" : "none",
    } as React.CSSProperties),

  // 🔥 SETTINGS ICON
  settingsIcon: (active: boolean) =>
    ({
      padding: "6px 10px",
      borderRadius: 10,
      cursor: "pointer",
      fontSize: 18,

      border: active
        ? "1px solid var(--primary-color)"
        : "1px solid transparent",

      background: active
        ? "var(--primary-color)"
        : "var(--surface)",

      color: active ? "#fff" : "var(--text)",

      boxShadow: active
        ? "0 4px 12px rgba(0,0,0,0.1)"
        : "0 2px 6px rgba(0,0,0,0.05)",

      transition: "0.2s ease",
    } as React.CSSProperties),
};

// ================= SIDEBAR =================
export const sidebarStyles = (props: {
  width: number;
  isMobile: boolean;
  open: boolean;
}) => ({
  aside: {
    width: props.isMobile ? 280 : props.width,
    position: props.isMobile ? "fixed" : "relative",
    left: props.isMobile && !props.open ? "-300px" : 0,
    top: 0,
    height: "100vh",

    background: "var(--surface)",
    color: "var(--text)",

    borderRight: "1px solid rgba(0,0,0,0.06)",

    padding: 16,
    transition: "0.25s ease",
    zIndex: 1000,
    overflowY: "auto",
  } as React.CSSProperties,

  // 🔥 NEW: SECTION TITLE (FOR GROUPING)
  sectionTitle: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.5px",

    opacity: 0.6,
    marginTop: 18,
    marginBottom: 6,
    paddingLeft: 6,
  } as React.CSSProperties,

  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } as React.CSSProperties,

  // 🔥 IMPROVED BUTTON
  button: (active: boolean) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 10,

      padding: "10px 12px",
      borderRadius: 10,
      cursor: "pointer",
      fontSize: 14,

      border: active
        ? "1px solid var(--primary-color)"
        : "1px solid transparent",

      background: active
        ? "var(--primary-color)"
        : "transparent",

      color: active ? "#fff" : "var(--text)",

      transition: "0.2s ease",
    } as React.CSSProperties),

  // 🔥 HOVER STATE (OPTIONAL USE INLINE)
  buttonHover: {
    background: "rgba(0,0,0,0.04)",
  } as React.CSSProperties,

  resizeHandle: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 6,
    height: "100%",
    cursor: "ew-resize",
  } as React.CSSProperties,

  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    zIndex: 999,
  } as React.CSSProperties,
});

// ================= BRAND HEADER =================
export const sidebarHeaderStyles = {
  container: {
    display: "flex",
    alignItems: "center",
    gap: 12,

    marginBottom: 16,
    paddingBottom: 12,

    borderBottom: "1px solid rgba(0,0,0,0.06)",

    cursor: "pointer",
    transition: "0.2s ease",
  } as React.CSSProperties,

  logo: {
    width: 42,
    height: 42,
    objectFit: "cover",
    borderRadius: 10,

    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
  } as React.CSSProperties,

  text: {
    display: "flex",
    flexDirection: "column",
    lineHeight: 1.2,
  } as React.CSSProperties,
};