// =========================
// app/portal/dashboard/page.tsx
// =========================
"use client";

import { useEffect, useState } from "react";
import { db } from "@/app/lib/db";
import { getPortalUser, logout } from "@/app/lib/auth";
import { useRouter } from "next/navigation";

export default function PortalDashboard() {
  const [student, setStudent] = useState<any>(null);
  const [scores, setScores] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    const user = getPortalUser();
    if (!user) return router.push("/portal");

    load(user.id);
  }, []);

  const load = async (id: number) => {
    const s = await db.students.get(id);
    const sc = await db.scores.where("studentId").equals(id).toArray();
    const pay = await db.payments.where("studentId").equals(id).toArray();

    setStudent(s);
    setScores(sc);
    setPayments(pay);
  };

  if (!student) return <p>Loading...</p>;

  return (
    <div style={{ padding: 20 }}>
      <h2>{student.fullName}</h2>

      <button onClick={() => { logout(); router.push("/portal"); }}>
        Logout
      </button>

      <h3>Results</h3>
      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>Total</th>
            <th>Grade</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s) => (
            <tr key={s.id}>
              <td>{s.subjectId}</td>
              <td>{s.total}</td>
              <td>{s.grade}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Payments</h3>
      <ul>
        {payments.map((p) => (
          <li key={p.id}>{p.amount} - {p.date}</li>
        ))}
      </ul>
    </div>
  );
}

// =========================
// OPTIONAL: protect route hook
// =========================
export function requireAuth(router: any) {
  const user = getPortalUser();
  if (!user) router.push("/portal");
}