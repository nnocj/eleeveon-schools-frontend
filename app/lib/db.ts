import Dexie, { Table } from "dexie";

/**
 * STUDENT MODEL
 */
export interface Student {
  id?: number;
  name: string;
  classId: number;
  synced: boolean;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * SCORE MODEL
 */
export interface Score {
  id?: number;
  studentId: number;
  subjectId: number;
  classScore: number;
  examScore: number;
  synced: boolean;
}

/**
 * DATABASE CLASS
 */
class AppDB extends Dexie {
  students!: Table<Student, number>;
  scores!: Table<Score, number>;

  constructor() {
    super("EleeveonDB");

    this.version(1).stores({
      students: "++id, name, classId, synced",
      scores: "++id, studentId, subjectId, synced",
    });
  }
}

/**
 * SINGLE DATABASE INSTANCE
 */
export const db = new AppDB();