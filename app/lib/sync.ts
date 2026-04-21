import { db } from "./db";

export async function syncData() {
  const unsyncedStudents = await db.students
    .filter((student) => student.synced === false)
    .toArray();

  for (const student of unsyncedStudents) {
    try {
      const response = await fetch("/api/students", {
        method: "POST",
        body: JSON.stringify(student),
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Sync failed");
      }

      await db.students.put({
        ...student,
        synced: true,
      });

    } catch (error) {
      console.log("Sync failed, will retry", error);
    }
  }
}