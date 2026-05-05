"use client";

import { useEffect, useState } from "react";
import { db, Teacher } from "../lib/db";

export default function Teachers() {
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [relativePhone, setRelativePhone] = useState("");
  const [employmentDate, setEmploymentDate] = useState("");
  const [salary, setSalary] = useState("");

  const [role, setRole] = useState<"teacher" | "head_teacher">("teacher");
  const [signature, setSignature] = useState<string>("");

  const [teachers, setTeachers] = useState<Teacher[]>([]);

  const loadTeachers = async () => {
    const data = await db.teachers.toArray();
    console.log("Loaded teachers:", data); // 🔍 DEBUG
    setTeachers(data);
  };

  useEffect(() => {
    loadTeachers();
  }, []);

  const addTeacher = async () => {
    if (!fullName || !email) {
      alert("Name and Email are required");
      return;
    }

    // 🔥 Prevent multiple head teachers
    if (role === "head_teacher") {
      const existingHead = await db.teachers
        .where("role")
        .equals("head_teacher")
        .first();

      if (existingHead) {
        alert("A Head Teacher already exists");
        return;
      }
    }

    const newTeacher: Teacher = {
      fullName,
      age: Number(age),
      email,
      phone,
      relativePhone,
      employmentDate,
      salary: Number(salary),
      role,
      signature,
    };

    console.log("Saving teacher:", newTeacher); // 🔍 DEBUG

    await db.teachers.add(newTeacher);

    // Reset form
    setFullName("");
    setAge("");
    setEmail("");
    setPhone("");
    setRelativePhone("");
    setEmploymentDate("");
    setSalary("");
    setSignature("");
    setRole("teacher");

    loadTeachers();
  };

  return (
    <div style={{ padding: 10 }}>
      <h2>Teachers</h2>

      {/* FORM */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
        
        <input
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <input
          placeholder="Age"
          type="number"
          value={age}
          onChange={(e) => setAge(e.target.value)}
        />

        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <input
          placeholder="Relative Phone"
          value={relativePhone}
          onChange={(e) => setRelativePhone(e.target.value)}
        />

        <input
          type="date"
          value={employmentDate}
          onChange={(e) => setEmploymentDate(e.target.value)}
        />

        <input
          placeholder="Salary"
          type="number"
          value={salary}
          onChange={(e) => setSalary(e.target.value)}
        />

        {/* ✅ ROLE (FIXED PROPERLY) */}
        <select
          value={role}
          onChange={(e) =>
            setRole(e.target.value as "teacher" | "head_teacher")
          }
        >
          <option value="teacher">Teacher</option>
          <option value="head_teacher">Head Teacher</option>
        </select>

        {/* ✅ SIGNATURE */}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onloadend = () => {
              setSignature(reader.result as string);
            };
            reader.readAsDataURL(file);
          }}
        />

        {/* Preview */}
        {signature && signature.startsWith("data:image") && (
          <img
            src={signature}
            alt="Signature preview"
            style={{ height: 60, objectFit: "contain" }}
          />
        )}

        <button onClick={addTeacher}>Add Teacher</button>
      </div>

      <hr />

      {/* LIST */}
      <h3>Teacher List</h3>

      {teachers.length === 0 && <p>No teachers added yet</p>}

      {teachers.map((t) => (
        <div
          key={t.id}
          style={{
            border: "1px solid #ccc",
            padding: 10,
            marginBottom: 10,
            borderRadius: 6,
          }}
        >
          <strong>{t.fullName}</strong> <br />

          <b>
            Role:{" "}
            {t.role === "head_teacher" ? "Head Teacher" : "Teacher"}
          </b>
          <br />

          Email: {t.email} <br />
          Phone: {t.phone} <br />

          {/* Signature */}
          {t.signature && t.signature.startsWith("data:image") && (
            <div style={{ marginTop: 5 }}>
              <img
                src={t.signature}
                alt="signature"
                style={{ height: 40 }}
              />
            </div>
          )}

          <small>Employed: {t.employmentDate}</small>
        </div>
      ))}
    </div>
  );
}