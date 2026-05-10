"use client";

import { useEffect, useState } from "react";
import { useSettings } from "../context/settings-context";
import { db } from "../lib/db";

// ================= COLOR UTILITIES =================
function darken(hex: string, factor = 0.35) {
  let col = hex.replace("#", "");

  if (col.length === 3) {
    col = col.split("").map((c) => c + c).join("");
  }

  const num = parseInt(col, 16);

  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;

  r = Math.floor(r * factor);
  g = Math.floor(g * factor);
  b = Math.floor(b * factor);

  return `rgb(${r}, ${g}, ${b})`;
}

// ================= CONTRAST ENGINE =================
function getContrastTextColor(hex: string) {
  let col = hex.replace("#", "");

  if (col.length === 3) {
    col = col.split("").map((c) => c + c).join("");
  }

  const num = parseInt(col, 16);

  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  return brightness > 140 ? "#111" : "#fff";
}

// ================= FONT OPTIONS =================
const fontOptions = [
  { label: "System Default", value: "system-ui, -apple-system, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Helvetica", value: "Helvetica, sans-serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Tahoma", value: "Tahoma, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
  { label: "Segoe UI", value: "'Segoe UI', sans-serif" },
  { label: "Roboto", value: "Roboto, sans-serif" },
  { label: "Poppins", value: "Poppins, sans-serif" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Montserrat", value: "Montserrat, sans-serif" },
  { label: "Open Sans", value: "'Open Sans', sans-serif" },
  { label: "Lato", value: "Lato, sans-serif" },
  { label: "Nunito", value: "Nunito, sans-serif" },
  { label: "Ubuntu", value: "Ubuntu, sans-serif" },
  { label: "Merriweather", value: "Merriweather, serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Garamond", value: "Garamond, serif" },
  { label: "Palatino", value: "'Palatino Linotype', serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "Monaco", value: "Monaco, monospace" },
];

// ================= COMPONENT =================
export default function Settings() {
  const { settings, updateSettings } = useSettings();

  const [academicStructures, setAcademicStructures] = useState<any[]>([]);
  const [academicPeriods, setAcademicPeriods] = useState<any[]>([]);

  const [form, setForm] = useState<any>({
    currentTerm: "Term 1",
    academicYear: "",
    mode: "manual",

    schoolName: "",
    motto: "",
    logo: "",
    location: "",
    email: "",
    phone: "",
    address: "",
    website: "",

    theme: "light",
    primaryColor: "#2f6fed",

    fontSize: 16,
    fontFamily: "system-ui, -apple-system, sans-serif",

    schoolId: undefined,
    branchId: undefined,
    currentAcademicStructureId: undefined,
    currentAcademicPeriodId: undefined,
  });

  const [loading, setLoading] = useState(false);

  // ================= LOAD SETTINGS =================
  useEffect(() => {
    if (!settings) return;

    setForm((prev: any) => ({
      ...prev,
      ...settings,
    }));
  }, [settings]);

  // ================= LOAD ACADEMIC DATA (DB) =================
  useEffect(() => {
    const load = async () => {
      const structures = await db.academicStructures.toArray();
      const periods = await db.academicPeriods.toArray();

      setAcademicStructures(structures);
      setAcademicPeriods(periods);
    };

    load();
  }, []);

  // ================= UPDATE FIELD =================
  const updateField = (key: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  };

  // ================= HANDLE IMAGE =================
  const handleLogoUpload = (file: File) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        updateField("logo", reader.result);
      }
    };

    reader.readAsDataURL(file);
  };

  // ================= SAVE =================
  const saveSettings = async () => {
    setLoading(true);

    await updateSettings({
      ...settings,
      ...form,
      updatedAt: Date.now(),
    });

    setLoading(false);
  };

  // ================= APPLY GLOBAL THEME =================
  useEffect(() => {
    document.documentElement.style.setProperty("--primary-color", form.primaryColor);
    document.documentElement.style.setProperty("--font-family", form.fontFamily);
    document.documentElement.style.setProperty("--font-size", `${form.fontSize}px`);

    document.body.style.fontFamily = form.fontFamily;
    document.body.style.fontSize = `${form.fontSize}px`;

    document.documentElement.setAttribute("data-theme", form.theme);
  }, [form.primaryColor, form.fontFamily, form.fontSize, form.theme]);

  // ================= FAVICON =================
  useEffect(() => {
    if (!form.logo) return;

    let link: any =
      document.querySelector("link[rel~='icon']") ||
      document.createElement("link");

    link.rel = "icon";
    link.href = form.logo;

    document.head.appendChild(link);
  }, [form.logo]);

  const darkBg = darken(form.primaryColor, 0.25);

  const textColor = getContrastTextColor(
    form.theme === "dark" ? darkBg : "#ffffff"
  );

  const previewStyle: React.CSSProperties =
    form.theme === "dark"
      ? { background: darkBg, color: textColor }
      : { background: "#fff", color: "#111" };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>⚙ Settings</h2>

      {/* ================= ACADEMIC ================= */}
      <section style={styles.section}>
        <h3>📚 Academic System</h3>

        <input
          placeholder="Academic Year"
          value={form.academicYear}
          onChange={(e) => updateField("academicYear", e.target.value)}
          style={styles.input}
        />

        <select
          value={form.currentTerm}
          onChange={(e) => updateField("currentTerm", e.target.value)}
          style={styles.input}
        >
          <option>Term 1</option>
          <option>Term 2</option>
          <option>Term 3</option>
          <option>Semester 1</option>
          <option>Semester 2</option>
        </select>

        <select
          value={form.mode}
          onChange={(e) => updateField("mode", e.target.value)}
          style={styles.input}
        >
          <option value="manual">Manual Mode</option>
          <option value="auto">Auto Mode</option>
        </select>

        {/* ✅ ACADEMIC STRUCTURE FROM DB */}
        <select
          value={form.currentAcademicStructureId || ""}
          onChange={(e) =>
            updateField(
              "currentAcademicStructureId",
              Number(e.target.value)
            )
          }
          style={styles.input}
        >
          <option value="">Select Academic Structure</option>
          {academicStructures.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.level})
            </option>
          ))}
        </select>

        {/* ✅ ACADEMIC PERIOD FROM DB */}
        <select
          value={form.currentAcademicPeriodId || ""}
          onChange={(e) =>
            updateField(
              "currentAcademicPeriodId",
              Number(e.target.value)
            )
          }
          style={styles.input}
        >
          <option value="">Select Academic Period</option>
          {academicPeriods
            .filter(
              (p: any) =>
                !form.currentAcademicStructureId ||
                p.academicStructureId ===
                  form.currentAcademicStructureId
            )
            .map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </section>

      {/* ================= SCHOOL ================= */}
      <section style={styles.section}>
        <h3>🏫 School Identity</h3>

        <input
          placeholder="School Name"
          value={form.schoolName}
          onChange={(e) => updateField("schoolName", e.target.value)}
          style={styles.input}
        />

        <input
          placeholder="Motto"
          value={form.motto}
          onChange={(e) => updateField("motto", e.target.value)}
          style={styles.input}
        />

        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleLogoUpload(file);
          }}
          style={styles.input}
        />

        {form.logo && (
          <img src={form.logo} alt="logo" style={{ height: 80, marginBottom: 10 }} />
        )}

        <input
          placeholder="Location"
          value={form.location}
          onChange={(e) => updateField("location", e.target.value)}
          style={styles.input}
        />

        <input
          placeholder="Email"
          value={form.email}
          onChange={(e) => updateField("email", e.target.value)}
          style={styles.input}
        />

        <input
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => updateField("phone", e.target.value)}
          style={styles.input}
        />

        <input
          placeholder="Website"
          value={form.website}
          onChange={(e) => updateField("website", e.target.value)}
          style={styles.input}
        />

        <input
          placeholder="Address"
          value={form.address}
          onChange={(e) => updateField("address", e.target.value)}
          style={styles.input}
        />
      </section>

      {/* ================= UI ================= */}
      <section style={styles.section}>
        <h3>🎨 Theme</h3>

        <input
          type="color"
          value={form.primaryColor}
          onChange={(e) => updateField("primaryColor", e.target.value)}
          style={{ ...styles.input, height: 50 }}
        />

        <select
          value={form.fontFamily}
          onChange={(e) => updateField("fontFamily", e.target.value)}
          style={{ ...styles.input, fontFamily: form.fontFamily }}
        >
          {fontOptions.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>

        <input
          placeholder="Custom Font Family"
          value={form.fontFamily}
          onChange={(e) => updateField("fontFamily", e.target.value)}
          style={{ ...styles.input, fontFamily: form.fontFamily }}
        />

        <select
          value={form.theme}
          onChange={(e) => updateField("theme", e.target.value)}
          style={styles.input}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>

        <input
          type="number"
          min={8}
          max={72}
          placeholder="Font Size"
          value={form.fontSize}
          onChange={(e) =>
            updateField("fontSize", Number(e.target.value))
          }
          style={styles.input}
        />

        <div style={{ ...styles.preview, ...previewStyle }}>
          <b>Live Preview</b>

          <div
            style={{
              fontFamily: form.fontFamily,
              fontSize: `${form.fontSize}px`,
              marginTop: 10,
            }}
          >
            {form.schoolName || "School Name"}
          </div>

          <div style={{ marginTop: 10, opacity: 0.8 }}>
            The quick brown fox jumps over the lazy dog
          </div>
        </div>
      </section>

      <button onClick={saveSettings} style={styles.button} disabled={loading}>
        {loading ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}

// ================= STYLES =================
const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 850, padding: 20 },
  title: { marginBottom: 20 },
  section: {
    marginBottom: 25,
    padding: 16,
    border: "1px solid #eee",
    borderRadius: 10,
    background: "#fff",
  },
  input: {
    width: "100%",
    padding: 10,
    marginTop: 8,
    marginBottom: 10,
    borderRadius: 6,
    border: "1px solid #ddd",
    outline: "none",
  },
  button: {
    padding: "12px 18px",
    borderRadius: 8,
    border: "none",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
  },
  preview: {
    marginTop: 15,
    padding: 15,
    borderRadius: 10,
    border: "1px solid #ddd",
  },
};