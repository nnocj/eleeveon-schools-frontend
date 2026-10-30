import type { SeedBranchOptions, SeedEntityName, SeedTemplate, SeedDefinition } from "./types";
import { getSetupTemplate } from "./templates";

type Inspection = { expected: number; found: number; missing: string[] };

/**
 * The template calls its grading definitions `gradingSystems`, while the
 * persistent Dexie/Prisma entity is `gradingStructures`.
 * Keep those names distinct: the template key is not a database table.
 */
const TEMPLATE_TO_STORE: ReadonlyArray<{
  template: keyof SeedTemplate;
  store: SeedEntityName;
}> = [
  { template: "organizations", store: "organizations" },
  { template: "academicStructures", store: "academicStructures" },
  { template: "academicPeriods", store: "academicPeriods" },
  { template: "classes", store: "classes" },
  { template: "subjects", store: "subjects" },
  { template: "curriculums", store: "curriculums" },
  { template: "curriculumPathways", store: "curriculumPathways" },
  { template: "curriculumSubjects", store: "curriculumSubjects" },
  { template: "subjectPrerequisites", store: "subjectPrerequisites" },
  { template: "classSubjects", store: "classSubjects" },
  { template: "gradingSystems", store: "gradingStructures" },
  { template: "gradeRules", store: "gradeRules" },
  { template: "assessmentStructures", store: "assessmentStructures" },
  { template: "assessmentStructureItems", store: "assessmentStructureItems" },
  { template: "assessmentApplicabilities", store: "assessmentApplicabilities" },
];

export async function inspectBranchSetup(
  options: SeedBranchOptions,
): Promise<Partial<Record<SeedEntityName, Inspection>>> {
  const template = getSetupTemplate(options.templateCode);
  const result: Partial<Record<SeedEntityName, Inspection>> = {};

  for (const entry of TEMPLATE_TO_STORE) {
    const raw = template[entry.template];
    if (!Array.isArray(raw)) continue;
    const definitions = raw as SeedDefinition[];
    const missing: string[] = [];
    let found = 0;

    for (const definition of definitions) {
      const record = await options.store.findOne(entry.store, {
        accountId: options.accountId,
        schoolId: options.schoolId,
        branchId: options.branchId,
        setupSeedKey: `${entry.store}:${definition.key}`,
      });
      if (record && record.isDeleted !== true) {
        found += 1;
      } else {
        missing.push(definition.key);
      }
    }

    result[entry.store] = {
      expected: definitions.length,
      found,
      missing,
    };
  }
  return result;
}
