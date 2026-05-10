"use client";

import React, {
  CSSProperties,
  useEffect,
  useMemo,
  useState,
} from "react";

import { db } from "../lib/db";
import { useSettings } from "../context/settings-context";

// ======================================================
// TYPES
// ======================================================
type BranchForm = {
  name: string;
  code: string;

  phone: string;
  email: string;

  address: string;
  city: string;

  digitalAddress: string;

  headName: string;

  startDate: string;

  logo: string;

  active: boolean;
};

// ======================================================
// COMPONENT
// ======================================================
export default function Branches() {
  const { settings } = useSettings();

  // ======================================================
  // STATE
  // ======================================================
  const [branches, setBranches] = useState<any[]>(
    []
  );

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [showForm, setShowForm] =
    useState(false);

  const [editingId, setEditingId] =
    useState<number | null>(null);

  const [search, setSearch] =
    useState("");

  const [notification, setNotification] =
    useState<{
      type: "success" | "error";
      text: string;
    } | null>(null);

  // ======================================================
  // FORM
  // ======================================================
  const initialForm: BranchForm = {
    name: "",
    code: "",

    phone: "",
    email: "",

    address: "",
    city: "",

    digitalAddress: "",

    headName: "",

    startDate: "",

    logo: "",

    active: true,
  };

  const [form, setForm] =
    useState<BranchForm>(initialForm);

  // ======================================================
  // COLORS
  // ======================================================
  const primary =
    settings?.primaryColor ||
    "#2563eb";

  // ======================================================
  // NOTIFICATION
  // ======================================================
  const notify = (
    type: "success" | "error",
    text: string
  ) => {
    setNotification({ type, text });

    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  // ======================================================
  // LOAD
  // ======================================================
  const loadBranches = async () => {
    try {
      setLoading(true);

      const data =
        "branches" in db
          ? await (db as any).branches
              .orderBy("updatedAt")
              .reverse()
              .toArray()
          : [];

      setBranches(data);
    } catch (err) {
      console.error(err);

      notify(
        "error",
        "Failed to load branches."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  // ======================================================
  // FILTERED
  // ======================================================
  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      const query =
        search.toLowerCase();

      return (
        b.name
          ?.toLowerCase()
          .includes(query) ||
        b.code
          ?.toLowerCase()
          .includes(query) ||
        b.city
          ?.toLowerCase()
          .includes(query)
      );
    });
  }, [branches, search]);

  // ======================================================
  // RESET
  // ======================================================
  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  // ======================================================
  // CHANGE
  // ======================================================
  const handleChange = (
    key: keyof BranchForm,
    value: any
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // ======================================================
  // SAVE
  // ======================================================
  const handleSave = async () => {
    try {
      if (!form.name.trim()) {
        notify(
          "error",
          "Branch name is required."
        );

        return;
      }

      setSaving(true);

      const payload = {
        ...form,

        updatedAt: Date.now(),
        version: 1,
        synced: "pending",
        deviceId: "local-device",
      };

      // ================= EDIT =================
      if (editingId) {
        await (db as any).branches.update(
          editingId,
          payload
        );

        notify(
          "success",
          "Branch updated successfully."
        );
      }

      // ================= CREATE =================
      else {
        const exists =
          await (db as any).branches
            .where("name")
            .equalsIgnoreCase(form.name)
            .first();

        if (exists) {
          notify(
            "error",
            "Branch already exists."
          );

          return;
        }

        await (db as any).branches.add(
          payload
        );

        notify(
          "success",
          "Branch created successfully."
        );
      }

      resetForm();

      setShowForm(false);

      await loadBranches();
    } catch (err) {
      console.error(err);

      notify(
        "error",
        "Unable to save branch."
      );
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // EDIT
  // ======================================================
  const handleEdit = (branch: any) => {
    setEditingId(branch.id);

    setForm({
      name: branch.name || "",
      code: branch.code || "",

      phone: branch.phone || "",
      email: branch.email || "",

      address: branch.address || "",
      city: branch.city || "",

      digitalAddress:
        branch.digitalAddress || "",

      headName: branch.headName || "",

      startDate:
        branch.startDate || "",

      logo: branch.logo || "",

      active:
        branch.active ?? true,
    });

    setShowForm(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // ======================================================
  // DELETE
  // ======================================================
  const handleDelete = async (
    branch: any
  ) => {
    try {
      const students =
        "students" in db
          ? await db.students
              .where("branchId")
              .equals(branch.id)
              .count()
          : 0;

      const teachers =
        "teachers" in db
          ? await db.teachers
              .where("branchId")
              .equals(branch.id)
              .count()
          : 0;

      const classes =
        "classes" in db
          ? await db.classes
              .where("branchId")
              .equals(branch.id)
              .count()
          : 0;

      if (
        students > 0 ||
        teachers > 0 ||
        classes > 0
      ) {
        notify(
          "error",
          "Cannot delete branch with linked records."
        );

        return;
      }

      const ok = confirm(
        `Delete "${branch.name}" branch?`
      );

      if (!ok) return;

      await (db as any).branches.delete(
        branch.id
      );

      notify(
        "success",
        "Branch deleted successfully."
      );

      await loadBranches();
    } catch (err) {
      console.error(err);

      notify(
        "error",
        "Failed to delete branch."
      );
    }
  };

  // ======================================================
  // STYLES
  // ======================================================
  const card: CSSProperties = {
    background: "var(--surface)",
    border:
      "1px solid rgba(0,0,0,0.08)",
    borderRadius: 22,
    padding: 22,
    boxShadow:
      "0 10px 24px rgba(0,0,0,0.04)",
  };

  const input: CSSProperties = {
    width: "100%",
    padding: "13px 14px",

    borderRadius: 12,

    border:
      "1px solid rgba(0,0,0,0.12)",

    background: "var(--surface)",

    color: "var(--text)",

    fontSize: 14,

    outline: "none",
  };

  const label: CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 7,
    display: "block",
  };

  const button: CSSProperties = {
    padding: "12px 18px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
  };

  // ======================================================
  // UI
  // ======================================================
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      {/* ======================================================
          NOTIFICATION
      ====================================================== */}
      {notification && (
        <div
          style={{
            padding: "14px 18px",

            borderRadius: 14,

            background:
              notification.type ===
              "success"
                ? "rgba(16,185,129,0.12)"
                : "rgba(239,68,68,0.12)",

            color:
              notification.type ===
              "success"
                ? "#059669"
                : "#dc2626",

            border:
              notification.type ===
              "success"
                ? "1px solid rgba(16,185,129,0.25)"
                : "1px solid rgba(239,68,68,0.25)",

            fontWeight: 600,
          }}
        >
          {notification.text}
        </div>
      )}

      {/* ======================================================
          HERO
      ====================================================== */}
      <div
        style={{
          ...card,

          background: `
            linear-gradient(
              135deg,
              ${primary},
              rgba(37,99,235,0.84)
            )
          `,

          color: "#fff",

          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -60,
            top: -60,

            width: 220,
            height: 220,

            borderRadius: "50%",

            background:
              "rgba(255,255,255,0.08)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 13,
              opacity: 0.9,
              marginBottom: 10,
            }}
          >
            Multi-Branch Management
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 34,
              fontWeight: 900,
            }}
          >
            School Branches
          </h1>

          <p
            style={{
              maxWidth: 760,
              lineHeight: 1.7,
              marginTop: 12,
              opacity: 0.92,
            }}
          >
            Create and manage school
            branches, campuses, and
            administrative locations.
            Every student, teacher,
            class, department, and
            transaction can be linked
            to a branch for proper
            institutional management.
          </p>

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 20,
            }}
          >
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              style={{
                ...button,
                background: "#fff",
                color: primary,
              }}
            >
              ➕ Add Branch
            </button>

            <button
              style={{
                ...button,
                background:
                  "rgba(255,255,255,0.12)",

                color: "#fff",

                border:
                  "1px solid rgba(255,255,255,0.22)",
              }}
            >
              📊 Total Branches:{" "}
              {branches.length}
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================
          FORM
      ====================================================== */}
      {showForm && (
        <div style={card}>
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",

              alignItems: "center",

              marginBottom: 24,
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 24,
                }}
              >
                {editingId
                  ? "Edit Branch"
                  : "Create Branch"}
              </h2>

              <div
                style={{
                  opacity: 0.7,
                  marginTop: 6,
                  fontSize: 14,
                }}
              >
                Configure branch
                information and
                administration details.
              </div>
            </div>

            <button
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              style={{
                ...button,

                background:
                  "rgba(0,0,0,0.06)",

                color:
                  "var(--text)",
              }}
            >
              ✕ Close
            </button>
          </div>

          {/* FORM GRID */}
          <div
            style={{
              display: "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(280px, 1fr))",

              gap: 18,
            }}
          >
            {/* NAME */}
            <div>
              <label style={label}>
                Branch Name
              </label>

              <input
                value={form.name}
                onChange={(e) =>
                  handleChange(
                    "name",
                    e.target.value
                  )
                }
                style={input}
                placeholder="Eg. East Legon Campus"
              />
            </div>

            {/* CODE */}
            <div>
              <label style={label}>
                Branch Code
              </label>

              <input
                value={form.code}
                onChange={(e) =>
                  handleChange(
                    "code",
                    e.target.value
                  )
                }
                style={input}
                placeholder="ELC"
              />
            </div>

            {/* PHONE */}
            <div>
              <label style={label}>
                Phone
              </label>

              <input
                value={form.phone}
                onChange={(e) =>
                  handleChange(
                    "phone",
                    e.target.value
                  )
                }
                style={input}
                placeholder="0200000000"
              />
            </div>

            {/* EMAIL */}
            <div>
              <label style={label}>
                Email
              </label>

              <input
                value={form.email}
                onChange={(e) =>
                  handleChange(
                    "email",
                    e.target.value
                  )
                }
                style={input}
                placeholder="branch@school.com"
              />
            </div>

            {/* CITY */}
            <div>
              <label style={label}>
                City
              </label>

              <input
                value={form.city}
                onChange={(e) =>
                  handleChange(
                    "city",
                    e.target.value
                  )
                }
                style={input}
                placeholder="Accra"
              />
            </div>

            {/* DIGITAL ADDRESS */}
            <div>
              <label style={label}>
                Digital Address
              </label>

              <input
                value={
                  form.digitalAddress
                }
                onChange={(e) =>
                  handleChange(
                    "digitalAddress",
                    e.target.value
                  )
                }
                style={input}
                placeholder="GA-000-0000"
              />
            </div>

            {/* HEAD */}
            <div>
              <label style={label}>
                Branch Head
              </label>

              <input
                value={form.headName}
                onChange={(e) =>
                  handleChange(
                    "headName",
                    e.target.value
                  )
                }
                style={input}
                placeholder="Head of Branch"
              />
            </div>

            {/* START DATE */}
            <div>
              <label style={label}>
                Opening Date
              </label>

              <input
                type="date"
                value={form.startDate}
                onChange={(e) =>
                  handleChange(
                    "startDate",
                    e.target.value
                  )
                }
                style={input}
              />
            </div>

            {/* LOGO */}
            <div
              style={{
                gridColumn:
                  "1 / -1",
              }}
            >
              <label style={label}>
                Branch Logo URL
              </label>

              <input
                value={form.logo}
                onChange={(e) =>
                  handleChange(
                    "logo",
                    e.target.value
                  )
                }
                style={input}
                placeholder="https://..."
              />
            </div>

            {/* ADDRESS */}
            <div
              style={{
                gridColumn:
                  "1 / -1",
              }}
            >
              <label style={label}>
                Address
              </label>

              <textarea
                value={form.address}
                onChange={(e) =>
                  handleChange(
                    "address",
                    e.target.value
                  )
                }
                style={{
                  ...input,
                  resize: "vertical",
                  minHeight: 110,
                }}
                placeholder="Branch address..."
              />
            </div>
          </div>

          {/* ACTIVE */}
          <div
            style={{
              marginTop: 22,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  handleChange(
                    "active",
                    e.target.checked
                  )
                }
              />

              Branch is active
            </label>
          </div>

          {/* ACTIONS */}
          <div
            style={{
              display: "flex",
              gap: 12,

              marginTop: 28,

              flexWrap: "wrap",
            }}
          >
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                ...button,

                background: primary,
                color: "#fff",

                opacity: saving
                  ? 0.7
                  : 1,
              }}
            >
              {saving
                ? "Saving..."
                : editingId
                ? "💾 Update Branch"
                : "🚀 Create Branch"}
            </button>

            <button
              onClick={() => {
                resetForm();
              }}
              style={{
                ...button,

                background:
                  "rgba(0,0,0,0.06)",

                color:
                  "var(--text)",
              }}
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* ======================================================
          SEARCH + STATS
      ====================================================== */}
      <div
        style={{
          display: "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",

          gap: 16,
        }}
      >
        {/* SEARCH */}
        <div
          style={{
            ...card,
            gridColumn:
              "span 2",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            Search Branches
          </div>

          <input
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            style={input}
            placeholder="Search by branch name, code or city..."
          />
        </div>

        {/* TOTAL */}
        <div style={card}>
          <div
            style={{
              fontSize: 13,
              opacity: 0.7,
            }}
          >
            Total Branches
          </div>

          <div
            style={{
              fontSize: 34,
              fontWeight: 900,
              marginTop: 10,
            }}
          >
            {branches.length}
          </div>
        </div>

        {/* ACTIVE */}
        <div style={card}>
          <div
            style={{
              fontSize: 13,
              opacity: 0.7,
            }}
          >
            Active Branches
          </div>

          <div
            style={{
              fontSize: 34,
              fontWeight: 900,
              marginTop: 10,
            }}
          >
            {
              branches.filter(
                (b) => b.active
              ).length
            }
          </div>
        </div>
      </div>

      {/* ======================================================
          BRANCH LIST
      ====================================================== */}
      <div style={card}>
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",

            alignItems: "center",

            marginBottom: 22,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
              }}
            >
              Branch Directory
            </h2>

            <div
              style={{
                fontSize: 13,
                opacity: 0.7,
                marginTop: 4,
              }}
            >
              Manage all school
              branches and campuses.
            </div>
          </div>
        </div>

        {/* EMPTY */}
        {!loading &&
          filteredBranches.length ===
            0 && (
            <div
              style={{
                padding: 50,

                textAlign: "center",

                borderRadius: 20,

                border:
                  "1px dashed rgba(0,0,0,0.12)",

                background:
                  "rgba(0,0,0,0.02)",
              }}
            >
              <div
                style={{
                  fontSize: 58,
                  marginBottom: 14,
                }}
              >
                🏫
              </div>

              <h3
                style={{
                  margin: 0,
                }}
              >
                No Branches Found
              </h3>

              <p
                style={{
                  opacity: 0.7,
                  marginTop: 10,
                }}
              >
                Start by creating
                your first school
                branch.
              </p>

              <button
                onClick={() =>
                  setShowForm(true)
                }
                style={{
                  ...button,

                  background:
                    primary,

                  color: "#fff",

                  marginTop: 16,
                }}
              >
                ➕ Create Branch
              </button>
            </div>
          )}

        {/* LOADING */}
        {loading && (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              opacity: 0.7,
            }}
          >
            Loading branches...
          </div>
        )}

        {/* GRID */}
        <div
          style={{
            display: "grid",

            gridTemplateColumns:
              "repeat(auto-fit, minmax(320px, 1fr))",

            gap: 18,
          }}
        >
          {filteredBranches.map(
            (branch) => (
              <div
                key={branch.id}
                style={{
                  border:
                    "1px solid rgba(0,0,0,0.08)",

                  borderRadius: 22,

                  overflow:
                    "hidden",

                  background:
                    "var(--surface)",
                }}
              >
                {/* TOP */}
                <div
                  style={{
                    padding: 18,

                    display: "flex",
                    gap: 16,

                    alignItems:
                      "center",

                    borderBottom:
                      "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  {/* LOGO */}
                  {branch.logo ? (
                    <img
                      src={branch.logo}
                      alt=""
                      style={{
                        width: 70,
                        height: 70,

                        borderRadius: 18,

                        objectFit:
                          "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 70,
                        height: 70,

                        borderRadius: 18,

                        background:
                          primary,

                        color: "#fff",

                        display:
                          "grid",

                        placeItems:
                          "center",

                        fontWeight: 900,

                        fontSize: 26,
                      }}
                    >
                      {branch.name?.charAt(
                        0
                      )}
                    </div>
                  )}

                  {/* INFO */}
                  <div
                    style={{
                      flex: 1,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 10,

                        alignItems:
                          "center",

                        flexWrap:
                          "wrap",
                      }}
                    >
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 20,
                        }}
                      >
                        {branch.name}
                      </h3>

                      <span
                        style={{
                          padding:
                            "4px 10px",

                          borderRadius: 999,

                          fontSize: 11,

                          fontWeight: 700,

                          background:
                            branch.active
                              ? "rgba(16,185,129,0.12)"
                              : "rgba(239,68,68,0.12)",

                          color:
                            branch.active
                              ? "#059669"
                              : "#dc2626",
                        }}
                      >
                        {branch.active
                          ? "ACTIVE"
                          : "INACTIVE"}
                      </span>
                    </div>

                    <div
                      style={{
                        opacity: 0.65,
                        marginTop: 6,
                        fontSize: 13,
                      }}
                    >
                      {branch.code ||
                        "No Code"}{" "}
                      •{" "}
                      {branch.city ||
                        "No City"}
                    </div>
                  </div>
                </div>

                {/* BODY */}
                <div
                  style={{
                    padding: 18,

                    display: "flex",
                    flexDirection:
                      "column",

                    gap: 14,
                  }}
                >
                  <InfoRow
                    label="Phone"
                    value={
                      branch.phone ||
                      "—"
                    }
                  />

                  <InfoRow
                    label="Email"
                    value={
                      branch.email ||
                      "—"
                    }
                  />

                  <InfoRow
                    label="Head"
                    value={
                      branch.headName ||
                      "—"
                    }
                  />

                  <InfoRow
                    label="Address"
                    value={
                      branch.address ||
                      "—"
                    }
                  />

                  {/* ACTIONS */}
                  <div
                    style={{
                      display: "flex",
                      gap: 10,

                      marginTop: 10,
                    }}
                  >
                    <button
                      onClick={() =>
                        handleEdit(
                          branch
                        )
                      }
                      style={{
                        ...button,

                        flex: 1,

                        background:
                          "rgba(37,99,235,0.10)",

                        color:
                          primary,
                      }}
                    >
                      ✏ Edit
                    </button>

                    <button
                      onClick={() =>
                        handleDelete(
                          branch
                        )
                      }
                      style={{
                        ...button,

                        flex: 1,

                        background:
                          "rgba(239,68,68,0.10)",

                        color:
                          "#dc2626",
                      }}
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ======================================================
// INFO ROW
// ======================================================
function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          opacity: 0.6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>

      <div
        style={{
          lineHeight: 1.5,
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        {value}
      </div>
    </div>
  );
}