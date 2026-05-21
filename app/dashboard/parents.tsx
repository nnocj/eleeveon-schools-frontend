"use client";

/**
 * parents.tsx
 * ---------------------------------------------------------
 * MOBILE-FIRST SECURE PARENT / GUARDIAN MANAGEMENT PAGE
 * ---------------------------------------------------------
 *
 * DB tables:
 * - parents
 * - studentParents
 * - students
 *
 * Production rules:
 * - Signed-in account required.
 * - Active school + branch required.
 * - All reads/writes are scoped by accountId + schoolId + branchId.
 * - Mobile-first parent cards and link cards.
 * - Responsive create/edit and link drawers.
 * - Dashboard-shell safe: no horizontal overflow.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAccount } from "../context/account-context";
import { useSettings } from "../context/settings-context";
import { useActiveBranch } from "../context/active-branch-context";

import { SyncStatus } from "../lib/constants/syncStatus";
import { db, Parent, Student, StudentParent } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";

// ======================================================
// TYPES
// ======================================================

type Relationship = "father" | "mother" | "guardian";
type StudentParentRelationship = "father" | "mother" | "guardian" | "other";

type TenantRow = {
  accountId?: string;
  schoolId?: number;
  branchId?: number;
  isDeleted?: boolean;
};

type FormState = {
  id?: number;
  fullName: string;
  phone: string;
  photo?: string;
  coverPhoto?: string;
  email?: string;
  address?: string;
  occupation?: string;
  emergencyContact?: string;
  relationship?: Relationship;
};

type LinkFormState = {
  parentId?: number;
  studentId?: number;
  relationship: StudentParentRelationship;
  isPrimary?: boolean;
};

type ParentView = {
  row: Parent;
  linkedStudents: Student[];
  relations: StudentParent[];
  linkCount: number;
  primaryChildren: number;
};

const emptyForm: FormState = {
  fullName: "",
  phone: "",
  photo: "",
  coverPhoto: "",
  email: "",
  address: "",
  occupation: "",
  emergencyContact: "",
  relationship: "guardian",
};

const emptyLinkForm: LinkFormState = {
  parentId: undefined,
  studentId: undefined,
  relationship: "guardian",
  isPrimary: false,
};

const relationshipLabel = (value?: string) => {
  if (!value) return "Guardian";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

// ======================================================
// COMPONENT
// ======================================================

export default function ParentsPage() {
  const router = useRouter();

  const {
    accountId,
    authenticated,
    loading: accountLoading,
  } = useAccount();

  const { settings, loading: settingsLoading } = useSettings();

  const {
    activeSchool,
    activeSchoolId,
    activeBranch,
    activeBranchId,
    loading: contextLoading,
  } = useActiveBranch();

  const schoolId = activeSchoolId || activeSchool?.id || settings?.schoolId;
  const branchId = activeBranchId || activeBranch?.id || settings?.branchId;
  const primary = settings?.primaryColor || "var(--primary-color, #2563eb)";

  // ======================================================
  // STATE
  // ======================================================

  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);

  const [rows, setRows] = useState<Parent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentParents, setStudentParents] = useState<StudentParent[]>([]);

  const [search, setSearch] = useState("");
  const [filterRelationship, setFilterRelationship] = useState<"all" | Relationship>("all");
  const [filterLinked, setFilterLinked] = useState<"all" | "linked" | "unlinked">("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [linkDrawerOpen, setLinkDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [linkForm, setLinkForm] = useState<LinkFormState>(emptyLinkForm);

  // ======================================================
  // AUTH + CONTEXT PROTECTION
  // ======================================================

  useEffect(() => {
    if (accountLoading || contextLoading) return;

    if (!authenticated || !accountId) {
      router.replace("/login");
      return;
    }

    if (!activeSchoolId || !activeBranchId) {
      router.replace("/account");
    }
  }, [
    accountLoading,
    contextLoading,
    authenticated,
    accountId,
    activeSchoolId,
    activeBranchId,
    router,
  ]);

  // ======================================================
  // LOAD DATA
  // ======================================================

  const sameTenant = (row: TenantRow) =>
    row.accountId === accountId &&
    row.schoolId === schoolId &&
    row.branchId === branchId &&
    !row.isDeleted;

  const clearData = () => {
    setRows([]);
    setStudents([]);
    setStudentParents([]);
  };

  const load = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      clearData();
      setPageLoading(false);
      return;
    }

    try {
      setPageLoading(true);

      const [parentRows, studentRows, relationRows] = await Promise.all([
        db.parents.toArray(),
        db.students.toArray(),
        db.studentParents.toArray(),
      ]);

      setRows(parentRows.filter(sameTenant));

      setStudents(
        studentRows
          .filter((row) => sameTenant(row) && row.status !== "withdrawn")
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );

      setStudentParents(relationRows.filter(sameTenant));
    } catch (error) {
      console.error("Failed to load parents:", error);
      clearData();
      alert("Failed to load parents");
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, accountId, schoolId, branchId]);

  // ======================================================
  // LOOKUPS
  // ======================================================

  const studentMap = useMemo(
    () => new Map(students.map((row) => [row.id, row])),
    [students]
  );

  const relationByParent = useMemo(() => {
    const map = new Map<number, StudentParent[]>();

    studentParents.forEach((row) => {
      const list = map.get(row.parentId) || [];
      list.push(row);
      map.set(row.parentId, list);
    });

    return map;
  }, [studentParents]);

  const relationByStudent = useMemo(() => {
    const map = new Map<number, StudentParent[]>();

    studentParents.forEach((row) => {
      const list = map.get(row.studentId) || [];
      list.push(row);
      map.set(row.studentId, list);
    });

    return map;
  }, [studentParents]);

  // ======================================================
  // VIEW MODEL
  // ======================================================

  const viewRows = useMemo<ParentView[]>(() => {
    return rows.map((row) => {
      const relations = relationByParent.get(row.id || 0) || [];
      const linkedStudents = relations
        .map((relation) => studentMap.get(relation.studentId))
        .filter(Boolean) as Student[];

      return {
        row,
        linkedStudents,
        relations,
        linkCount: linkedStudents.length,
        primaryChildren: relations.filter((relation) => relation.isPrimary).length,
      };
    });
  }, [rows, relationByParent, studentMap]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return viewRows
      .filter((item) => {
        const row = item.row;

        if (filterRelationship !== "all" && row.relationship !== filterRelationship) return false;
        if (filterLinked === "linked" && item.linkCount === 0) return false;
        if (filterLinked === "unlinked" && item.linkCount > 0) return false;

        if (!query) return true;

        return `
          ${row.fullName}
          ${row.phone}
          ${row.email || ""}
          ${row.address || ""}
          ${row.occupation || ""}
          ${row.emergencyContact || ""}
          ${row.relationship || ""}
          ${item.linkedStudents.map((student) => student.fullName).join(" ")}
        `
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.row.fullName.localeCompare(b.row.fullName));
  }, [viewRows, search, filterRelationship, filterLinked]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      linked: viewRows.filter((item) => item.linkCount > 0).length,
      unlinked: viewRows.filter((item) => item.linkCount === 0).length,
      studentsWithParents: relationByStudent.size,
      primaryParents: studentParents.filter((row) => row.isPrimary).length,
    };
  }, [rows, viewRows, relationByStudent, studentParents]);

  // ======================================================
  // FORM HELPERS
  // ======================================================

  const updateForm = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const updateLinkForm = (patch: Partial<LinkFormState>) => {
    setLinkForm((prev) => ({ ...prev, ...patch }));
  };

  const fileToBase64 = (file: File) => {
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (field: "photo" | "coverPhoto", file?: File) => {
    if (!file) return;
    const value = await fileToBase64(file);
    updateForm({ [field]: value });
  };

  const requireTenant = () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      alert("Sign in and select a school branch first.");
      return false;
    }

    return true;
  };

  const openCreate = () => {
    if (!requireTenant()) return;

    setEditMode(false);
    setForm(emptyForm);
    setDrawerOpen(true);
  };

  const openEdit = (row: Parent) => {
    setEditMode(true);
    setForm({
      id: row.id,
      fullName: row.fullName,
      phone: row.phone,
      photo: row.photo || "",
      coverPhoto: row.coverPhoto || "",
      email: row.email || "",
      address: row.address || "",
      occupation: row.occupation || "",
      emergencyContact: row.emergencyContact || "",
      relationship: row.relationship || "guardian",
    });
    setDrawerOpen(true);
  };

  const openLinkDrawer = (parent?: Parent) => {
    if (!requireTenant()) return;

    setLinkForm({
      parentId: parent?.id,
      studentId: undefined,
      relationship: parent?.relationship || "guardian",
      isPrimary: false,
    });

    setLinkDrawerOpen(true);
  };

  // ======================================================
  // VALIDATION + SAVE PARENT
  // ======================================================

  const validate = () => {
    if (!authenticated || !accountId) return "Sign in first";
    if (!schoolId) return "Select a school first";
    if (!branchId) return "Select a branch first";
    if (!form.fullName.trim()) return "Enter parent full name";
    if (!form.phone.trim()) return "Enter parent phone number";

    const duplicate = rows.find((row) => {
      if (editMode && row.id === form.id) return false;
      return row.phone.trim().toLowerCase() === form.phone.trim().toLowerCase();
    });

    if (duplicate) return "A parent with this phone number already exists in this branch";

    return null;
  };

  const save = async () => {
    const error = validate();

    if (error) {
      alert(error);
      return;
    }

    try {
      setSaving(true);

      const payload = prepareSyncData({
        accountId,
        schoolId,
        branchId,
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        photo: form.photo || undefined,
        coverPhoto: form.coverPhoto || undefined,
        email: form.email?.trim() || undefined,
        address: form.address?.trim() || undefined,
        occupation: form.occupation?.trim() || undefined,
        emergencyContact: form.emergencyContact?.trim() || undefined,
        relationship: form.relationship || "guardian",
      }) as Parent;

      let savedParentId = form.id;

      if (editMode && form.id) {
        await db.parents.update(form.id, {
          ...payload,
          id: form.id,
          isDeleted: false,
        });
      } else {
        const id = await db.parents.add(payload);
        savedParentId = Number(id);
      }

      setDrawerOpen(false);
      await load();

      if (!editMode && savedParentId) {
        openLinkDrawer({ ...payload, id: savedParentId });
      }
    } catch (error) {
      console.error("Failed to save parent:", error);
      alert("Failed to save parent");
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // LINK STUDENT + PARENT
  // ======================================================

  const saveLink = async () => {
    if (!authenticated || !accountId || !schoolId || !branchId) {
      alert("Sign in and select a branch first.");
      return;
    }

    if (!linkForm.parentId) {
      alert("Select parent");
      return;
    }

    if (!linkForm.studentId) {
      alert("Select student");
      return;
    }

    const duplicate = studentParents.find(
      (row) =>
        row.parentId === Number(linkForm.parentId) &&
        row.studentId === Number(linkForm.studentId) &&
        !row.isDeleted
    );

    if (duplicate) {
      alert("This parent is already linked to this student");
      return;
    }

    try {
      setLinkSaving(true);

      if (linkForm.isPrimary) {
        const existingPrimaryLinks = studentParents.filter(
          (row) => row.studentId === Number(linkForm.studentId) && row.isPrimary
        );

        await Promise.all(
          existingPrimaryLinks.map((row) =>
            row.id
              ? db.studentParents.update(row.id, {
                  isPrimary: false,
                  synced: SyncStatus.PENDING,
                  updatedAt: Date.now(),
                })
              : Promise.resolve()
          )
        );
      }

      const payload = prepareSyncData({
        accountId,
        schoolId,
        branchId,
        parentId: Number(linkForm.parentId),
        studentId: Number(linkForm.studentId),
        relationship: linkForm.relationship,
        isPrimary: !!linkForm.isPrimary,
      }) as StudentParent;

      await db.studentParents.add(payload);

      setLinkDrawerOpen(false);
      await load();
    } catch (error) {
      console.error("Failed to link parent and student:", error);
      alert("Failed to link parent and student");
    } finally {
      setLinkSaving(false);
    }
  };

  const unlink = async (relationId?: number) => {
    if (!relationId) return;
    if (!confirm("Remove this parent-student link?")) return;

    await db.studentParents.update(relationId, {
      isDeleted: true,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    });

    await load();
  };

  const remove = async (item: ParentView) => {
    if (!item.row.id) return;

    if (item.linkCount) {
      const proceed = confirm(
        `This parent is linked to ${item.linkCount} student(s). Delete anyway?`
      );
      if (!proceed) return;
    } else if (!confirm("Delete this parent?")) {
      return;
    }

    await db.parents.update(item.row.id, {
      isDeleted: true,
      synced: SyncStatus.PENDING,
      updatedAt: Date.now(),
    });

    await load();
  };

  // ======================================================
  // PROTECTED STATES
  // ======================================================

  if (accountLoading || contextLoading || settingsLoading || pageLoading) {
    return (
      <main className="par-page" style={{ "--par-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="par-state-card">
          <div className="par-spinner" />
          <h2>Opening parents...</h2>
          <p>Checking account, branch, parents, students, and family links.</p>
        </section>
      </main>
    );
  }

  if (!authenticated || !accountId) {
    return (
      <main className="par-page" style={{ "--par-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="par-state-card">
          <h2>Redirecting to login...</h2>
          <p>You must sign in before managing parents.</p>
        </section>
      </main>
    );
  }

  if (!schoolId || !branchId) {
    return (
      <main className="par-page" style={{ "--par-primary": primary } as React.CSSProperties}>
        <style>{css}</style>
        <section className="par-state-card">
          <h2>Select a branch first</h2>
          <p>Parents belong to one active school branch.</p>
          <button type="button" className="par-primary-btn" onClick={() => router.push("/account")}>
            Go to Account Setup
          </button>
        </section>
      </main>
    );
  }

  // ======================================================
  // UI
  // ======================================================

  return (
    <main className="par-page" style={{ "--par-primary": primary } as React.CSSProperties}>
      <style>{css}</style>

      <section className="par-hero">
        <div className="par-hero-left">
          <div className="par-hero-icon">👨‍👩‍👧</div>
          <div className="par-title-wrap">
            <p>Family Records</p>
            <h2>Parents & Guardians</h2>
            <span>
              {activeBranch?.name || "Selected branch"}
              {activeSchool?.name ? ` · ${activeSchool.name}` : ""}
            </span>
          </div>
        </div>

        <div className="par-hero-actions">
          <button type="button" className="par-ghost-btn" onClick={() => openLinkDrawer()}>
            Link Parent
          </button>
          <button type="button" className="par-primary-btn" onClick={openCreate}>
            + Add Parent
          </button>
        </div>
      </section>

      <section className="par-summary-grid" aria-label="Parent summary">
        <SummaryCard label="Parents" value={summary.total} icon="👥" />
        <SummaryCard label="Linked" value={summary.linked} icon="🔗" />
        <SummaryCard label="Unlinked" value={summary.unlinked} icon="⚠️" />
        <SummaryCard label="Students With Parents" value={summary.studentsWithParents} icon="🎓" />
        <SummaryCard label="Primary Links" value={summary.primaryParents} icon="⭐" />
      </section>

      <section className="par-filter-card">
        <input
          placeholder="Search parent, phone, email, occupation, student..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select value={filterRelationship} onChange={(event) => setFilterRelationship(event.target.value as any)}>
          <option value="all">All Relationships</option>
          <option value="father">Father</option>
          <option value="mother">Mother</option>
          <option value="guardian">Guardian</option>
        </select>

        <select value={filterLinked} onChange={(event) => setFilterLinked(event.target.value as any)}>
          <option value="all">All Link Status</option>
          <option value="linked">Linked</option>
          <option value="unlinked">Unlinked</option>
        </select>
      </section>

      <section className="par-list">
        {filteredRows.map((item) => {
          const row = item.row;

          return (
            <article key={row.id} className="par-entity-card">
              {row.coverPhoto && (
                <div
                  className="par-card-banner"
                  style={{ backgroundImage: `linear-gradient(135deg, rgba(15,23,42,.44), rgba(15,23,42,.08)), url(${row.coverPhoto})` }}
                />
              )}

              <div className="par-card-body">
                <div className="par-card-top">
                  <Avatar name={row.fullName} photo={row.photo} primary={primary} />

                  <div className="par-card-main">
                    <h3>{row.fullName}</h3>
                    <p>{row.phone}{row.email ? ` · ${row.email}` : ""}</p>

                    <div className="par-chip-row">
                      <Chip tone="blue">{relationshipLabel(row.relationship)}</Chip>
                      <Chip tone={item.linkCount ? "green" : "orange"}>
                        {item.linkCount ? `${item.linkCount} child link(s)` : "Unlinked"}
                      </Chip>
                      {item.primaryChildren > 0 && <Chip tone="purple">{item.primaryChildren} primary</Chip>}
                    </div>
                  </div>
                </div>

                <div className="par-meta-grid">
                  <MiniStat label="Occupation" value={row.occupation || "-"} />
                  <MiniStat label="Emergency" value={row.emergencyContact || "-"} />
                  <MiniStat label="Address" value={row.address || "-"} />
                </div>

                {!!item.relations.length && (
                  <div className="par-link-list">
                    {item.relations.map((relation) => {
                      const student = studentMap.get(relation.studentId);

                      return (
                        <div key={relation.id} className="par-link-row">
                          <div>
                            <strong>{student?.fullName || `Student #${relation.studentId}`}</strong>
                            <span>
                              {relationshipLabel(relation.relationship)}
                              {relation.isPrimary ? " · Primary" : ""}
                            </span>
                          </div>
                          <button type="button" onClick={() => unlink(relation.id)}>Remove</button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="par-action-row">
                  <button type="button" onClick={() => openLinkDrawer(row)}>Link Student</button>
                  <button type="button" onClick={() => openEdit(row)}>Edit</button>
                  <button type="button" className="danger" onClick={() => remove(item)}>Delete</button>
                </div>
              </div>
            </article>
          );
        })}

        {!filteredRows.length && <EmptyCard text="No parents found in this branch." />}
      </section>

      {drawerOpen && (
        <Drawer title={editMode ? "Edit Parent" : "Add Parent"} subtitle={`Parent will be saved under ${activeBranch?.name || "the selected branch"}.`} onClose={() => setDrawerOpen(false)}>
          <div className="par-form-grid">
            <Field label="Full Name">
              <input value={form.fullName} onChange={(event) => updateForm({ fullName: event.target.value })} placeholder="Parent / guardian full name" />
            </Field>

            <div className="par-form-two">
              <Field label="Phone">
                <input value={form.phone} onChange={(event) => updateForm({ phone: event.target.value })} placeholder="Phone number" />
              </Field>

              <Field label="Email">
                <input value={form.email || ""} onChange={(event) => updateForm({ email: event.target.value })} placeholder="Email address" />
              </Field>
            </div>

            <Field label="Relationship">
              <select value={form.relationship || "guardian"} onChange={(event) => updateForm({ relationship: event.target.value as Relationship })}>
                <option value="father">Father</option>
                <option value="mother">Mother</option>
                <option value="guardian">Guardian</option>
              </select>
            </Field>

            <div className="par-form-two">
              <Field label="Occupation">
                <input value={form.occupation || ""} onChange={(event) => updateForm({ occupation: event.target.value })} placeholder="Occupation" />
              </Field>

              <Field label="Emergency Contact">
                <input value={form.emergencyContact || ""} onChange={(event) => updateForm({ emergencyContact: event.target.value })} placeholder="Emergency contact" />
              </Field>
            </div>

            <Field label="Address">
              <textarea value={form.address || ""} onChange={(event) => updateForm({ address: event.target.value })} placeholder="Parent address" rows={3} />
            </Field>

            <Field label="Photo">
              <input type="file" accept="image/*" onChange={(event) => handleImageUpload("photo", event.target.files?.[0])} />
              {form.photo && <img src={form.photo} alt="Parent" className="par-preview-photo" />}
            </Field>

            <Field label="Cover Photo">
              <input type="file" accept="image/*" onChange={(event) => handleImageUpload("coverPhoto", event.target.files?.[0])} />
              {form.coverPhoto && <img src={form.coverPhoto} alt="Parent cover" className="par-preview-banner" />}
            </Field>

            <button type="button" onClick={save} disabled={saving} className="par-save-btn">
              {saving ? "Saving..." : editMode ? "Save Changes" : "Add Parent"}
            </button>
          </div>
        </Drawer>
      )}

      {linkDrawerOpen && (
        <Drawer title="Link Parent to Student" subtitle="Connect a parent or guardian to a student record." onClose={() => setLinkDrawerOpen(false)}>
          <div className="par-form-grid">
            <Field label="Parent">
              <select value={linkForm.parentId || ""} onChange={(event) => updateLinkForm({ parentId: Number(event.target.value) || undefined })}>
                <option value="">Select Parent</option>
                {rows.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.fullName} · {parent.phone}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Student">
              <select value={linkForm.studentId || ""} onChange={(event) => updateLinkForm({ studentId: Number(event.target.value) || undefined })}>
                <option value="">Select Student</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.fullName} {student.admissionNumber ? `· ${student.admissionNumber}` : ""}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Relationship to Student">
              <select value={linkForm.relationship} onChange={(event) => updateLinkForm({ relationship: event.target.value as StudentParentRelationship })}>
                <option value="father">Father</option>
                <option value="mother">Mother</option>
                <option value="guardian">Guardian</option>
                <option value="other">Other</option>
              </select>
            </Field>

            <label className="par-check">
              <input type="checkbox" checked={!!linkForm.isPrimary} onChange={(event) => updateLinkForm({ isPrimary: event.target.checked })} />
              <span>Mark as primary parent/guardian for this student</span>
            </label>

            <button type="button" onClick={saveLink} disabled={linkSaving} className="par-save-btn">
              {linkSaving ? "Linking..." : "Link Parent to Student"}
            </button>
          </div>
        </Drawer>
      )}
    </main>
  );
}

// ======================================================
// SMALL COMPONENTS
// ======================================================

function SummaryCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="par-summary-card">
      <div className="par-summary-icon">{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  );
}

function Avatar({ name, photo, primary }: { name: string; photo?: string; primary: string }) {
  return (
    <div className="par-avatar" style={{ background: photo ? `url(${photo}) center/cover` : `linear-gradient(135deg, ${primary}, rgba(255,255,255,.2))` }}>
      {!photo && name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "blue" | "gray" | "orange" | "purple" }) {
  return <span className={`par-chip ${tone}`}>{children}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="par-mini-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <section className="par-empty-card">
      <div className="par-empty-icon">👨‍👩‍👧</div>
      <h3>No parents found</h3>
      <p>{text}</p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="par-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Drawer({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="par-drawer-layer">
      <button type="button" className="par-drawer-overlay" aria-label="Close drawer" onClick={onClose} />
      <aside className="par-drawer">
        <div className="par-drawer-head">
          <div>
            <p>Parents</p>
            <h2>{title}</h2>
            <span>{subtitle}</span>
          </div>
          <button type="button" onClick={onClose}>✕</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

// ======================================================
// CSS
// ======================================================

const css = `
@keyframes parSpin { to { transform: rotate(360deg); } }

.par-page {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 8px;
  padding-bottom: max(28px, env(safe-area-inset-bottom));
  background: var(--bg, #f8fafc);
  color: var(--text, #0f172a);
  font-family: var(--font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  overflow-x: hidden;
}
.par-page *, .par-page *::before, .par-page *::after { box-sizing: border-box; }
.par-page button, .par-page input, .par-page select, .par-page textarea { font: inherit; max-width: 100%; }
.par-page img { max-width: 100%; }
.par-page input,
.par-page select,
.par-page textarea {
  width: 100%;
  min-height: 43px;
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 15px;
  padding: 0 12px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  outline: none;
  font-weight: 750;
}
.par-page textarea { padding-top: 10px; resize: vertical; }

.par-state-card {
  min-height: min(420px, calc(100dvh - 32px));
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  width: min(460px, 100%);
  margin: 0 auto;
  padding: 22px;
  border-radius: 28px;
  background: var(--surface, #fff);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 24px 60px rgba(15, 23, 42, .08);
  text-align: center;
}
.par-state-card h2 { margin: 0; font-size: clamp(18px, 5vw, 24px); font-weight: 1000; letter-spacing: -.04em; }
.par-state-card p { max-width: 34rem; margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }
.par-spinner { width: 38px; height: 38px; border-radius: 999px; border: 4px solid color-mix(in srgb, var(--par-primary) 18%, transparent); border-top-color: var(--par-primary); animation: parSpin .8s linear infinite; }

.par-primary-btn,
.par-save-btn {
  min-height: 46px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--par-primary);
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}
.par-save-btn { width: 100%; }
.par-ghost-btn {
  min-height: 46px;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  padding: 0 18px;
  background: var(--surface, #fff);
  color: var(--text, #0f172a);
  font-weight: 950;
  cursor: pointer;
}
.par-primary-btn:disabled,
.par-save-btn:disabled { opacity: .55; cursor: not-allowed; }

.par-hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 28px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--par-primary) 12%, #fff), #fff 64%);
  border: 1px solid rgba(148, 163, 184, .22);
  box-shadow: 0 18px 46px rgba(15, 23, 42, .07);
  overflow: hidden;
}
.par-hero-left { min-width: 0; display: flex; align-items: center; gap: 10px; flex: 1 1 auto; }
.par-hero-icon { width: 46px; height: 46px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 18px; background: var(--par-primary); color: #fff; box-shadow: 0 12px 26px color-mix(in srgb, var(--par-primary) 28%, transparent); font-size: 22px; }
.par-title-wrap { min-width: 0; }
.par-title-wrap p, .par-title-wrap h2, .par-title-wrap span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.par-title-wrap p { margin: 0 0 2px; color: var(--par-primary); font-size: 10px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.par-title-wrap h2 { margin: 0; font-size: clamp(19px, 5vw, 28px); font-weight: 1000; letter-spacing: -.06em; line-height: 1; }
.par-title-wrap span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; }
.par-hero-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }

.par-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.par-summary-card { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 22px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .04); overflow: hidden; }
.par-summary-icon { width: 36px; height: 36px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--par-primary) 12%, #fff); }
.par-summary-card div:last-child { min-width: 0; }
.par-summary-card strong, .par-summary-card span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.par-summary-card strong { font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.par-summary-card span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 850; }

.par-filter-card { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin-top: 10px; padding: 10px; border-radius: 24px; background: var(--surface, #fff); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 16px 40px rgba(15, 23, 42, .055); }
.par-list { display: grid; gap: 10px; margin-top: 10px; }
.par-entity-card,
.par-empty-card { min-width: 0; border-radius: 24px; background: linear-gradient(135deg, #fff, #f8fafc); border: 1px solid rgba(148, 163, 184, .2); box-shadow: 0 12px 28px rgba(15, 23, 42, .045); overflow: hidden; }
.par-card-banner { height: 92px; background-size: cover; background-position: center; }
.par-card-body { padding: 13px; }
.par-card-top { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.par-avatar { width: 58px; height: 58px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 19px; color: #fff; font-weight: 1000; box-shadow: 0 12px 24px rgba(15, 23, 42, .12); }
.par-card-main { min-width: 0; flex: 1; }
.par-card-main h3, .par-card-main p { display: block; overflow: hidden; text-overflow: ellipsis; }
.par-card-main h3 { margin: 0; font-size: 17px; font-weight: 1000; letter-spacing: -.035em; }
.par-card-main p { margin: 4px 0 0; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.4; }
.par-chip-row, .par-action-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.par-chip { max-width: 100%; display: inline-flex; align-items: center; min-height: 25px; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 950; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.par-chip.green { background: rgba(34,197,94,.12); color: #16a34a; }
.par-chip.red { background: rgba(239,68,68,.12); color: #dc2626; }
.par-chip.blue { background: rgba(59,130,246,.12); color: #2563eb; }
.par-chip.gray { background: rgba(107,114,128,.12); color: #4b5563; }
.par-chip.orange { background: rgba(245,158,11,.14); color: #b45309; }
.par-chip.purple { background: rgba(147,51,234,.12); color: #7e22ce; }
.par-meta-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-top: 10px; }
.par-mini-stat { min-width: 0; padding: 9px; border-radius: 17px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .13); overflow: hidden; }
.par-mini-stat strong, .par-mini-stat span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.par-mini-stat strong { font-size: 13px; font-weight: 1000; }
.par-mini-stat span { margin-top: 2px; color: var(--muted, #64748b); font-size: 10px; font-weight: 850; }
.par-link-list { display: grid; gap: 7px; margin-top: 10px; }
.par-link-row { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px; border-radius: 16px; background: rgba(148, 163, 184, .08); border: 1px solid rgba(148, 163, 184, .13); }
.par-link-row div { min-width: 0; }
.par-link-row strong, .par-link-row span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.par-link-row strong { font-size: 12px; font-weight: 1000; }
.par-link-row span { margin-top: 2px; color: var(--muted, #64748b); font-size: 11px; font-weight: 800; }
.par-link-row button { flex: 0 0 auto; border: 0; background: transparent; color: #dc2626; font-size: 12px; font-weight: 950; cursor: pointer; }
.par-action-row button { min-height: 40px; border: 1px solid rgba(148, 163, 184, .24); border-radius: 999px; padding: 0 13px; background: var(--surface, #fff); color: var(--text, #0f172a); font-size: 12px; font-weight: 950; cursor: pointer; }
.par-action-row button.danger { color: #dc2626; background: rgba(239, 68, 68, .08); border-color: rgba(239, 68, 68, .12); }
.par-empty-card { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 210px; padding: 22px; text-align: center; border-style: dashed; }
.par-empty-icon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 22px; background: color-mix(in srgb, var(--par-primary) 12%, #fff); font-size: 28px; }
.par-empty-card h3 { margin: 0; font-size: 18px; font-weight: 1000; }
.par-empty-card p { margin: 0; color: var(--muted, #64748b); font-size: 13px; line-height: 1.6; }

.par-drawer-layer { position: fixed; inset: 0; z-index: 80; }
.par-drawer-overlay { position: absolute; inset: 0; border: 0; background: rgba(15, 23, 42, .52); }
.par-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(94vw, 620px); max-width: 100vw; overflow-y: auto; overflow-x: hidden; background: var(--surface, #fff); color: var(--text, #0f172a); padding: 14px; box-shadow: -24px 0 70px rgba(15, 23, 42, .22); }
.par-drawer-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 6px 0 12px; background: var(--surface, #fff); }
.par-drawer-head div { min-width: 0; }
.par-drawer-head p { margin: 0; color: var(--par-primary); font-size: 11px; font-weight: 950; letter-spacing: .08em; text-transform: uppercase; }
.par-drawer-head h2, .par-drawer-head span { display: block; overflow: hidden; text-overflow: ellipsis; }
.par-drawer-head h2 { margin: 2px 0 0; font-size: 22px; font-weight: 1000; letter-spacing: -.05em; }
.par-drawer-head span { margin-top: 3px; color: var(--muted, #64748b); font-size: 12px; font-weight: 750; line-height: 1.45; }
.par-drawer-head button { width: 38px; height: 38px; flex: 0 0 auto; border: 1px solid rgba(148, 163, 184, .24); border-radius: 15px; background: #fff; font-weight: 1000; cursor: pointer; }
.par-form-grid { display: grid; gap: 12px; }
.par-form-two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.par-field { display: grid; gap: 6px; min-width: 0; }
.par-field > span { color: var(--muted, #64748b); font-size: 11px; font-weight: 950; letter-spacing: .06em; text-transform: uppercase; }
.par-check { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 18px; background: rgba(148, 163, 184, .09); border: 1px solid rgba(148, 163, 184, .14); font-weight: 850; }
.par-check input { width: 18px; min-height: 18px; flex: 0 0 auto; }
.par-preview-photo { width: 94px; height: 82px; border-radius: 16px; margin-top: 8px; object-fit: cover; }
.par-preview-banner { width: 100%; height: 126px; border-radius: 16px; margin-top: 8px; object-fit: cover; }
.par-save-btn { width: 100%; }

@media (min-width: 680px) {
  .par-page { padding: 12px; }
  .par-summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .par-filter-card { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .par-form-two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 1040px) {
  .par-page { padding: 16px; }
  .par-summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .par-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .par-page { padding: 6px; }
  .par-hero { flex-direction: column; border-radius: 22px; padding: 10px; }
  .par-hero-actions { display: grid; grid-template-columns: 1fr; }
  .par-primary-btn, .par-ghost-btn { width: 100%; }
  .par-summary-grid { gap: 6px; }
  .par-summary-card { padding: 10px; border-radius: 19px; }
  .par-entity-card, .par-empty-card { border-radius: 20px; }
  .par-card-body { padding: 11px; }
  .par-card-top { align-items: flex-start; }
  .par-avatar { width: 52px; height: 52px; flex-basis: 52px; }
  .par-meta-grid { grid-template-columns: 1fr; }
  .par-link-row { align-items: flex-start; }
  .par-action-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .par-action-row button { width: 100%; padding: 0 8px; }
  .par-action-row button.danger { grid-column: 1 / -1; }
  .par-drawer { width: min(96vw, 620px); padding: 12px; }
}
`;
