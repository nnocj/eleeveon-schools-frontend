// =========================
// lib/auth.ts
// =========================
import { db } from "./db/db";

export async function loginStudent(studentId: number) {
  const student = await db.students.get(studentId);
  if (!student) throw new Error("Student not found");

  localStorage.setItem("portalUser", JSON.stringify({
    role: "student",
    id: student.id
  }));

  return student;
}

export function getPortalUser() {
  const raw = localStorage.getItem("portalUser");
  return raw ? JSON.parse(raw) : null;
}

export function logout() {
  localStorage.removeItem("portalUser");
}




