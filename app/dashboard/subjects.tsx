"use client";

import { useEffect, useState } from "react";
import { db } from "../lib/db";

export default function Subjects() {
  const [name, setName] = useState("");
  const [subjects, setSubjects] = useState<any[]>([]);

  const loadSubjects = async () => {
    const data = await db.subjects.toArray();
    setSubjects(data);
  };

  useEffect(() => {
    loadSubjects();
  }, []);

  const addSubject = async () => {
    if (!name) {
      alert("Subject name is required");
      return;
    }

    // 🚫 Prevent duplicate subjects
    const existing = await db.subjects
      .where("name")
      .equalsIgnoreCase(name)
      .first();

    if (existing) {
      alert("Subject already exists");
      return;
    }

    await db.subjects.add({ name });

    setName("");
    loadSubjects();
  };

  return (
    <div style={{ padding: 10 }}>
      <h2>Subjects</h2>

      {/* FORM */}
      <div style={{ display: "flex", gap: 10 }}>
        <input
          placeholder="Subject Name (e.g. Mathematics)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <button onClick={addSubject}>Add Subject</button>
      </div>

      <hr />

      {/* LIST */}
      <h3>Subject List</h3>

      {subjects.length === 0 && <p>No subjects added yet</p>}

      {subjects.map((s) => (
        <div
          key={s.id}
          style={{
            border: "1px solid #ccc",
            padding: 10,
            marginBottom: 8,
            borderRadius: 6,
          }}
        >
          {s.name}
        </div>
      ))}
    </div>
  );
}