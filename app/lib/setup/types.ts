export type SetupTemplateCode =
  | "ghana-early-childhood-v1"
  | "ghana-primary-v1"
  | "ghana-jhs-v1"
  | "ghana-basic-school-v1"
  | "ghana-shs-v1"
  | "ghana-full-school-v1"
  | "ghana-kg-v2"
  | "ghana-kg-primary-v2"
  | "ghana-kg-primary-jhs-v2"
  | "ghana-jhs-shs-v2";

export type SeedEntityName =
  | "organizations" | "academicStructures" | "academicPeriods" | "classes"
  | "subjects" | "curriculums" | "curriculumPathways" | "curriculumSubjects"
  | "subjectPrerequisites" | "classSubjects" | "gradingStructures" | "gradeRules"
  | "assessmentStructures" | "assessmentStructureItems" | "assessmentApplicabilities";

export interface SeedDefinition { key: string; [key: string]: unknown }
export interface SeedTemplate {
  code: SetupTemplateCode;
  version: number;
  name: string;
  organizations: SeedDefinition[];
  academicStructures: SeedDefinition[];
  academicPeriods: SeedDefinition[];
  classes: SeedDefinition[];
  subjects: SeedDefinition[];
  curriculums: SeedDefinition[];
  curriculumPathways: SeedDefinition[];
  curriculumSubjects: SeedDefinition[];
  subjectPrerequisites: SeedDefinition[];
  classSubjects: SeedDefinition[];
  gradingSystems: SeedDefinition[];
  gradeRules: SeedDefinition[];
  assessmentStructures: SeedDefinition[];
  assessmentStructureItems: SeedDefinition[];
  assessmentApplicabilities: SeedDefinition[];
}

export interface SeedStore {
  create<T extends Record<string, unknown>>(table: SeedEntityName, value: T): Promise<T & { id: string }>;
  update?(table: SeedEntityName, id: string, patch: Record<string, unknown>): Promise<unknown>;
  findOne<T extends Record<string, unknown>>(table: SeedEntityName, query: Record<string, unknown>): Promise<(T & { id: string }) | undefined>;
}

export interface SeedContext {
  store: SeedStore;
  accountId: string;
  schoolId: string;
  branchId: string;
  templateCode: SetupTemplateCode;
  templateVersion: number;
  academicYearName: string;
  academicYearStart: string;
  academicYearEnd: string;
  ids: Record<SeedEntityName, Record<string, string>>;
  counts: Record<SeedEntityName, { created: number; reused: number }>;
}

export interface SeedBranchOptions {
  store: SeedStore;
  accountId: string;
  schoolId: string;
  branchId: string;
  templateCode: SetupTemplateCode;
  academicYearName: string;
  academicYearStart: string;
  academicYearEnd: string;
}

export interface SeedBranchResult {
  templateCode: SetupTemplateCode;
  templateVersion: number;
  counts: SeedContext["counts"];
  ids: SeedContext["ids"];
}
