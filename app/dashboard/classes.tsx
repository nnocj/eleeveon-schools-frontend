"use client";

import { useEffect, useState } from "react";
import { db } from "../lib/db";
import { prepareSyncData } from "../lib/sync/syncUtils";

export default function Classes() {
  const [name, setName] = useState("");
  const [classes, setClasses] = useState<any[]>([]);

  // ================= LOAD =================
  const loadClasses = async () => {
    const data = await db.classes.toArray();
    setClasses(data);
  };

  useEffect(() => {
    loadClasses();
  }, []);

  // ================= ADD CLASS =================
  const addClass = async () => {
    if (!name) {
      alert("Please enter class name");
      return;
    }

    const existing = await db.classes
      .filter((c) => c.name.toLowerCase() === name.toLowerCase())
      .first();

    if (existing) {
      alert("Class already exists");
      return;
    }

    await db.classes.add(
      prepareSyncData({
        name,
      })
    );

    setName("");
    loadClasses();
  };

  // ================= UI =================
  return (
    <div style={{ padding: 10 }}>
      <h2>Classes</h2>

      {/* FORM */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 300 }}>
        <input
          placeholder="Class Name (e.g. JHS 1)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <button onClick={addClass}>Add Class</button>
      </div>

      <hr />

      {/* LIST */}
      <h3>Class List</h3>

      {classes.length === 0 && <p>No classes added yet</p>}

      {classes.map((c) => (
        <div
          key={c.id}
          style={{
            border: "1px solid #ccc",
            padding: 10,
            marginBottom: 10,
            borderRadius: 6,
          }}
        >
          <strong>{c.name}</strong>
          <br />
          <small>Class ID: {c.id}</small>
        </div>
      ))}
    </div>
  );
}