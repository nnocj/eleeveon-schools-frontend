// =========================
// app/portal/page.tsx
// =========================
"use client";

import { useState } from "react";
import { loginStudent } from "@/app/lib/auth";
import { useRouter } from "next/navigation";

export default function PortalLogin() {
  const [studentId, setStudentId] = useState("");
  const router = useRouter();

  const handleLogin = async () => {
    try {
      await loginStudent(Number(studentId));
      router.push("/portal/dashboard");
    } catch (e) {
      alert("Login failed");
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Student Portal Login</h2>
      <input
        placeholder="Enter Student ID"
        value={studentId}
        onChange={(e) => setStudentId(e.target.value)}
      />
      <button onClick={handleLogin}>Login</button>
    </div>
  );
}