"use client";

import { useEffect, useMemo, useState } from "react";
import { db, Organization } from "../lib/db";
import { SyncStatus } from "../lib/constants/syncStatus";
const ORGANIZATION_TYPES: Organization["type"][] = [
  "department",
  "faculty",
  "house",
  "club",
  "committee",
  "administration",
];

export default function Organizations() {
  const [items, setItems] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    type: "department" as Organization["type"],
    parentOrganizationId: "",
    branchId: "1",
  });

  // ======================================================
  // LOAD ORGANIZATIONS
  // ======================================================

  const loadOrganizations = async () => {
    try {
      setLoading(true);

      const data = await db.organizations.toArray();

      const filtered = data.filter((item) => !item.isDeleted);

      filtered.sort((a, b) => {
        return b.updatedAt - a.updatedAt;
      });

      setItems(filtered);
    } catch (error) {
      console.error("Failed to load organizations:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrganizations();
  }, []);

  // ======================================================
  // RESET FORM
  // ======================================================

  const resetForm = () => {
    setEditingId(null);

    setForm({
      name: "",
      description: "",
      type: "department",
      parentOrganizationId: "",
      branchId: "1",
    });

    setShowForm(false);
  };

  // ======================================================
  // SAVE
  // ======================================================

  const saveOrganization = async () => {
    try {
      if (!form.name.trim()) {
        alert("Organization name is required");
        return;
      }

      const now = Date.now();

      const payload: Organization = {
        branchId: Number(form.branchId),

        name: form.name.trim(),

        description: form.description.trim(),

        type: form.type,

        parentOrganizationId: form.parentOrganizationId
          ? Number(form.parentOrganizationId)
          : undefined,

        createdAt: now,

        updatedAt: now,

        version: now,

        deviceId: "local-device",

        synced: SyncStatus.PENDING,

        isDeleted: false,
      };

      if (editingId) {
        await db.organizations.update(editingId, {
          ...payload,
          createdAt: undefined,
        });
      } else {
        await db.organizations.add(payload);
      }

      await loadOrganizations();

      resetForm();
    } catch (error) {
      console.error("Save error:", error);

      alert("Failed to save organization");
    }
  };

  // ======================================================
  // EDIT
  // ======================================================

  const editOrganization = (item: Organization) => {
    setEditingId(item.id || null);

    setForm({
      name: item.name || "",

      description: item.description || "",

      type: item.type,

      parentOrganizationId: item.parentOrganizationId
        ? String(item.parentOrganizationId)
        : "",

      branchId: String(item.branchId || 1),
    });

    setShowForm(true);
  };

  // ======================================================
  // DELETE (SOFT DELETE)
  // ======================================================

  const deleteOrganization = async (id?: number) => {
    if (!id) return;

    const confirmed = confirm(
      "Are you sure you want to delete this organization?"
    );

    if (!confirmed) return;

    try {
      await db.organizations.update(id, {
        isDeleted: true,
        updatedAt: Date.now(),
      });

      await loadOrganizations();
    } catch (error) {
      console.error("Delete error:", error);

      alert("Failed to delete organization");
    }
  };

  // ======================================================
  // GET PARENT NAME
  // ======================================================

  const getParentName = (parentId?: number) => {
    if (!parentId) return "None";

    const parent = items.find((x) => x.id === parentId);

    return parent?.name || "Unknown";
  };

  // ======================================================
  // GROUPED DATA
  // ======================================================

  const groupedOrganizations = useMemo(() => {
    const groups: Record<string, Organization[]> = {};

    for (const type of ORGANIZATION_TYPES) {
      groups[type] = items.filter((item) => item.type === type);
    }

    return groups;
  }, [items]);

  // ======================================================
  // UI
  // ======================================================

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        paddingBottom: 40,
      }}
    >
      {/* ====================================================== */}
      {/* HEADER */}
      {/* ====================================================== */}

      <div
        style={{
          background: "var(--surface)",
          borderRadius: 16,
          padding: 20,
          border: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 24,
          }}
        >
          Organizations
        </h1>

        <p
          style={{
            marginTop: 8,
            marginBottom: 0,
            opacity: 0.7,
            lineHeight: 1.5,
          }}
        >
          Manage school departments, faculties, clubs, committees,
          houses, and administrative units.
        </p>
      </div>

      {/* ====================================================== */}
      {/* ACTION BAR */}
      {/* ====================================================== */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setShowForm((prev) => !prev)}
          style={{
            border: "none",
            padding: "12px 16px",
            borderRadius: 10,
            background: "var(--primary-color)",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {showForm ? "Close Form" : "➕ Add Organization"}
        </button>

        <div
          style={{
            opacity: 0.7,
            fontSize: 14,
          }}
        >
          Total Organizations: {items.length}
        </div>
      </div>

      {/* ====================================================== */}
      {/* FORM */}
      {/* ====================================================== */}

      {showForm && (
        <div
          style={{
            background: "var(--surface)",
            borderRadius: 16,
            padding: 20,
            border: "1px solid rgba(0,0,0,0.08)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 18,
            }}
          >
            {editingId ? "Edit Organization" : "Create Organization"}
          </h2>

          {/* NAME */}

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontWeight: 600,
              }}
            >
              Organization Name
            </label>

            <input
              type="text"
              placeholder="Enter organization name"
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                })
              }
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                outline: "none",
                background: "transparent",
              }}
            />
          </div>

          {/* TYPE */}

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontWeight: 600,
              }}
            >
              Organization Type
            </label>

            <select
              value={form.type}
              onChange={(e) =>
                setForm({
                  ...form,
                  type: e.target.value as Organization["type"],
                })
              }
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                background: "transparent",
                outline: "none",
              }}
            >
              {ORGANIZATION_TYPES.map((type) => (
                <option
                  key={type}
                  value={type}
                >
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* PARENT */}

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontWeight: 600,
              }}
            >
              Parent Organization
            </label>

            <select
              value={form.parentOrganizationId}
              onChange={(e) =>
                setForm({
                  ...form,
                  parentOrganizationId: e.target.value,
                })
              }
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                background: "transparent",
                outline: "none",
              }}
            >
              <option value="">No Parent</option>

              {items
                .filter((x) => x.id !== editingId)
                .map((org) => (
                  <option
                    key={org.id}
                    value={org.id}
                  >
                    {org.name}
                  </option>
                ))}
            </select>
          </div>

          {/* DESCRIPTION */}

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontWeight: 600,
              }}
            >
              Description
            </label>

            <textarea
              placeholder="Organization description..."
              value={form.description}
              onChange={(e) =>
                setForm({
                  ...form,
                  description: e.target.value,
                })
              }
              style={{
                width: "100%",
                minHeight: 100,
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                background: "transparent",
                outline: "none",
                resize: "vertical",
              }}
            />
          </div>

          {/* ACTIONS */}

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={saveOrganization}
              style={{
                border: "none",
                padding: "12px 16px",
                borderRadius: 10,
                background: "green",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {editingId ? "Update Organization" : "Save Organization"}
            </button>

            <button
              onClick={resetForm}
              style={{
                border: "1px solid rgba(0,0,0,0.2)",
                padding: "12px 16px",
                borderRadius: 10,
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ====================================================== */}
      {/* ORGANIZATIONS */}
      {/* ====================================================== */}

      {loading ? (
        <div
          style={{
            padding: 30,
            textAlign: "center",
            opacity: 0.7,
          }}
        >
          Loading organizations...
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            padding: 30,
            textAlign: "center",
            background: "var(--surface)",
            borderRadius: 16,
            border: "1px solid rgba(0,0,0,0.08)",
            opacity: 0.7,
          }}
        >
          No organizations created yet.
        </div>
      ) : (
        ORGANIZATION_TYPES.map((type) => {
          const data = groupedOrganizations[type];

          if (!data.length) return null;

          return (
            <div
              key={type}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    textTransform: "capitalize",
                  }}
                >
                  {type}
                </h2>

                <span
                  style={{
                    opacity: 0.6,
                    fontSize: 13,
                  }}
                >
                  {data.length} item(s)
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 14,
                }}
              >
                {data.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: "var(--surface)",
                      borderRadius: 16,
                      padding: 16,
                      border: "1px solid rgba(0,0,0,0.08)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 18,
                        }}
                      >
                        {item.name}
                      </h3>

                      <div
                        style={{
                          marginTop: 6,
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: "rgba(0,0,0,0.08)",
                            textTransform: "capitalize",
                          }}
                        >
                          {item.type}
                        </span>

                        <span
                          style={{
                            fontSize: 12,
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: "rgba(0,0,0,0.05)",
                          }}
                        >
                          Parent:{" "}
                          {getParentName(item.parentOrganizationId)}
                        </span>
                      </div>
                    </div>

                    <p
                      style={{
                        margin: 0,
                        opacity: 0.75,
                        lineHeight: 1.5,
                        fontSize: 14,
                      }}
                    >
                      {item.description || "No description provided."}
                    </p>

                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        marginTop: "auto",
                      }}
                    >
                      <button
                        onClick={() => editOrganization(item)}
                        style={{
                          border: "1px solid rgba(0,0,0,0.2)",
                          background: "transparent",
                          padding: "8px 12px",
                          borderRadius: 8,
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => deleteOrganization(item.id)}
                        style={{
                          border: "1px solid red",
                          color: "red",
                          background: "transparent",
                          padding: "8px 12px",
                          borderRadius: 8,
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}