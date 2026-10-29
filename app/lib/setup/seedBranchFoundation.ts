import type { SeedBranchOptions, SeedBranchResult } from "./types";import { getSetupTemplate } from "./templates";import { createSeedContext } from "./createSeedContext";
import { seedOrganizations } from "./seeders/seedOrganizations";import { seedAcademicStructures } from "./seeders/seedAcademicStructures";import { seedAcademicPeriods } from "./seeders/seedAcademicPeriods";import { seedClasses } from "./seeders/seedClasses";import { seedSubjects } from "./seeders/seedSubjects";import { seedCurriculums } from "./seeders/seedCurriculums";import { seedCurriculumPathways } from "./seeders/seedCurriculumPathways";import { seedCurriculumSubjects } from "./seeders/seedCurriculumSubjects";import { seedSubjectPrerequisites } from "./seeders/seedSubjectPrerequisites";import { seedClassSubjects } from "./seeders/seedClassSubjects";import { seedGradingSystems } from "./seeders/seedGradingSystems";import { seedGradeRules } from "./seeders/seedGradeRules";import { seedAssessmentStructures } from "./seeders/seedAssessmentStructures";import { seedAssessmentItems } from "./seeders/seedAssessmentItems";import { seedAssessmentApplicabilities } from "./seeders/seedAssessmentApplicabilities";
export async function seedBranchFoundation(options:SeedBranchOptions):Promise<SeedBranchResult>{const t=getSetupTemplate(options.templateCode);const all=(names:keyof typeof t)=>new Set((t[names] as {key:string}[]).map(d=>d.key));
const refs:[keyof typeof t,keyof typeof t,string][]=[
 ["academicPeriods","academicStructures","academicStructureKey"],
 ["curriculums","academicStructures","academicStructureKey"],
 ["curriculumPathways","curriculums","curriculumKey"],
 ["curriculumSubjects","curriculums","curriculumKey"],
 ["curriculumSubjects","subjects","subjectKey"],
 ["classSubjects","classes","classKey"],
 ["classSubjects","subjects","subjectKey"],
 ["classSubjects","curriculumSubjects","curriculumSubjectKey"],
 ["classSubjects","academicStructures","academicStructureKey"],
 ["gradeRules","gradingSystems","gradingSystemKey"],
 ["assessmentStructures","academicStructures","academicStructureKey"],
 ["assessmentStructureItems","assessmentStructures","assessmentStructureKey"],
 ["assessmentApplicabilities","classSubjects","classSubjectKey"],
 ["assessmentApplicabilities","assessmentStructures","assessmentStructureKey"],
 ];
for(const [entity,dep,field] of refs){const keys=all(dep);for(const row of t[entity] as {key:string;[x:string]:unknown}[]){if(!keys.has(String(row[field])))throw new Error(`Invalid ${t.code}: ${entity}.${row.key} missing ${dep}.${String(row[field])}`);}}
for(const entity of ["academicStructures","academicPeriods","classes","subjects","curriculums","curriculumSubjects","classSubjects","gradingSystems","gradeRules","assessmentStructures","assessmentStructureItems","assessmentApplicabilities"] as const){const entries=t[entity] as {key:string}[];if(new Set(entries.map(x=>x.key)).size!==entries.length)throw new Error(`Duplicate ${entity} template keys`);}
if(t.academicStructures.length!==1||t.academicPeriods.length!==3)throw new Error("Setup must contain exactly one academic year and three terms");
const c=createSeedContext(options,t.version);await seedOrganizations(c,t.organizations);await seedAcademicStructures(c,t.academicStructures);await seedAcademicPeriods(c,t.academicPeriods);await seedClasses(c,t.classes);await seedSubjects(c,t.subjects);await seedCurriculums(c,t.curriculums);await seedCurriculumPathways(c,t.curriculumPathways);await seedCurriculumSubjects(c,t.curriculumSubjects);await seedSubjectPrerequisites(c,t.subjectPrerequisites);await seedClassSubjects(c,t.classSubjects);await seedGradingSystems(c,t.gradingSystems);await seedGradeRules(c,t.gradeRules);await seedAssessmentStructures(c,t.assessmentStructures);await seedAssessmentItems(c,t.assessmentStructureItems);await seedAssessmentApplicabilities(c,t.assessmentApplicabilities);return{templateCode:c.templateCode,templateVersion:c.templateVersion,counts:c.counts,ids:c.ids};}
