export const layout = {
  container: {
    display: "flex",
    height: "100vh",
    fontFamily: "system-ui",
    background: "var(--bg)",
    color: "var(--text)",
  } as React.CSSProperties,

  main: {
    flex: 1,
    padding: 20,
    overflowY: "auto",
    background: "var(--bg)",
  } as React.CSSProperties,

  topbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  } as React.CSSProperties,

  // 🔥 DARK MODE FRIENDLY HAMBURGER
  hamburger: (isMobile: boolean) =>
    ({
      padding: "8px 12px",
      fontSize: 18,
      borderRadius: 8,
      cursor: "pointer",

      background: "var(--surface)",
      border: "1px solid var(--primary-color)",
      color: "var(--text)",

      filter: isMobile ? "brightness(1.4)" : "none",
    } as React.CSSProperties),

  // 🔥 SETTINGS ICON (TOP RIGHT)
  settingsIcon: (active: boolean) =>
    ({
      padding: "6px 10px",
      borderRadius: 8,
      cursor: "pointer",
      fontSize: 18,

      border: active
        ? "1px solid var(--primary-color)"
        : "1px solid transparent",

      background: active
        ? "var(--primary-color)"
        : "var(--surface)",

      color: active ? "#fff" : "var(--text)",

      transition: "0.2s ease",
    } as React.CSSProperties),
};

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
    borderRight: "1px solid rgba(0,0,0,0.08)",

    padding: 14,
    transition: "0.25s ease",
    zIndex: 1000,
    overflowY: "auto",
  } as React.CSSProperties,

  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 10,
  } as React.CSSProperties,

  button: (active: boolean) =>
    ({
      textAlign: "left",
      padding: "10px 12px",
      borderRadius: 8,
      cursor: "pointer",
      fontSize: 14,

      border: active
        ? "1px solid var(--primary-color)"
        : "1px solid transparent",

      background: active ? "var(--primary-color)" : "transparent",
      color: active ? "#fff" : "var(--text)",
    } as React.CSSProperties),

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
    gap: 10,
    marginBottom: 15,
    paddingBottom: 10,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  } as React.CSSProperties,

  logo: {
    width: 40,
    height: 40,
    objectFit: "cover",
    borderRadius: 8,
  } as React.CSSProperties,

  text: {
    display: "flex",
    flexDirection: "column",
    lineHeight: 1.2,
  } as React.CSSProperties,
};