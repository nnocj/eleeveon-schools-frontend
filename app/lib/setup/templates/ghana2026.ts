import type { SeedDefinition, SeedTemplate, SetupTemplateCode } from "../types";
import { assessmentItems, defaultPeriods, percentageGrades } from "./common";

// NaCCA KG (2019), Primary SBC (2019, OWOP integrated from 2024/25), JHS CCP.
// Subject records are distinct from curriculum assignments. Schools may modify offerings.
type Stage = "kg" | "primary" | "jhs" | "shs" | "nursery";
type SubjectSpec = readonly [string, string, string];
const specs: Record<string, SubjectSpec> = {
 literacy: ["literacy", "Language and Literacy", "LIT"],
 numeracy: ["numeracy", "Numeracy", "NUM"],
 owop: ["owop", "Our World and Our People", "OWOP"],
 "creative-arts": ["creative-arts", "Creative Arts", "CA"],
 english: ["english", "English Language", "ENG"],
 mathematics: ["mathematics", "Mathematics", "MATH"],
 science: ["science", "Science", "SCI"],
 history: ["history", "History", "HIST"],
 "ghanaian-language": ["ghanaian-language", "Ghanaian Language", "GHL"],
 french: ["french", "French Language", "FRE"],
 computing: ["computing", "Computing", "COMP"],
 rme: ["rme", "Religious and Moral Education", "RME"],
 pe: ["pe", "Physical Education", "PE"],
 "social-studies": ["social-studies", "Social Studies", "SOC"],
 "career-technology": ["career-technology", "Career Technology", "CT"],
 "creative-arts-design": ["creative-arts-design", "Creative Arts and Design", "CAD"],
 "pe-health": ["pe-health", "Physical Education and Health", "PEH"],
 arabic: ["arabic", "Arabic", "ARA"],
 "core-mathematics": ["core-mathematics", "Core Mathematics", "CMATH"],
 "integrated-science": ["integrated-science", "Integrated Science", "ISCI"],
};
const KG = ["literacy", "numeracy", "creative-arts", "owop"];
const P13 = ["english", "mathematics", "science", "history", "ghanaian-language", "creative-arts", "rme", "pe"];
const P46 = [...P13, "french", "computing"];
const JHS = ["english", "mathematics", "science", "social-studies", "ghanaian-language", "french", "computing", "career-technology", "creative-arts-design", "rme", "pe-health", "arabic"];
// SHS is deliberately limited to a small foundation, not a purported complete NaCCA catalogue.
const SHS = ["english", "core-mathematics", "integrated-science", "social-studies"];
const stageClasses: Record<Stage, {key:string;name:string;code:string;level:string;subjects:string[]}[]> = {
 nursery: [1,2].map(i=>({key:`nursery-${i}`,name:`Nursery ${i}`,code:`N${i}`,level:"nursery",subjects:KG})),
 kg: [1,2].map(i=>({key:`kg-${i}`,name:`KG ${i}`,code:`KG${i}`,level:"nursery",subjects:KG})),
 primary: [1,2,3,4,5,6].map(i=>({key:`basic-${i}`,name:`Basic ${i}`,code:`B${i}`,level:"primary",subjects:i<=3?P13:P46})),
 jhs: [1,2,3].map(i=>({key:`jhs-${i}`,name:`JHS ${i}`,code:`JHS${i}`,level:"junior_high",subjects:JHS.filter(x=>x!=="arabic")})),
 shs: [1,2,3].map(i=>({key:`shs-${i}`,name:`SHS ${i}`,code:`SHS${i}`,level:"senior_high",subjects:SHS})),
};
const stageLabel:Record<Stage,string>={nursery:"Nursery",kg:"Kindergarten",primary:"Primary",jhs:"Junior High",shs:"Senior High"};
export const SETUP_COMBINATIONS: Record<SetupTemplateCode, Stage[]> = {
 "ghana-early-childhood-v1":["nursery","kg"],
 "ghana-kg-v2":["kg"],
 "ghana-primary-v1":["primary"],
 "ghana-kg-primary-v2":["kg","primary"],
 "ghana-jhs-v1":["jhs"],
 "ghana-basic-school-v1":["primary","jhs"],
 "ghana-kg-primary-jhs-v2":["kg","primary","jhs"],
 "ghana-shs-v1":["shs"],
 "ghana-jhs-shs-v2":["jhs","shs"],
 "ghana-full-school-v1":["kg","primary","jhs","shs"],
};
export function buildGhanaTemplate(code: SetupTemplateCode):SeedTemplate {
 const stages=SETUP_COMBINATIONS[code];
 const classes=stages.flatMap(stage=>stageClasses[stage]);
 const uniqueSubjectKeys=[...new Set(classes.flatMap(c=>c.subjects))];
 const subjects:SeedDefinition[]=uniqueSubjectKeys.map(k=>{const [key,name,subjectCode]=specs[k];return {key,name,code:subjectCode,category:"core"};});
 const curriculumSubjects:SeedDefinition[]=[];
 const classSubjects:SeedDefinition[]=[];
 const curriculums:SeedDefinition[]=[];
 const pathways:SeedDefinition[]=[];
 const organizations:SeedDefinition[]=[];
 const assessmentStructures:SeedDefinition[]=[];
 const assessmentStructureItems:SeedDefinition[]=[];
 const assessmentApplicabilities:SeedDefinition[]=[];
 for(const stage of stages){
  organizations.push({key:`${stage}-department`,name:`${stageLabel[stage]} Department`,type:"department"});
  curriculums.push({key:stage,name:`Ghana ${stageLabel[stage]} Curriculum`,code:`GH-${stage.toUpperCase()}`,academicStructureKey:"academic-year",curriculumVersion:"NaCCA-2024-2026"});
  pathways.push({key:`${stage}-general`,name:"General",code:"GEN",curriculumKey:stage});
  const stageSubjects=[...new Set(stageClasses[stage].flatMap(c=>c.subjects))];
  stageSubjects.forEach((key,i)=>curriculumSubjects.push({key:`${stage}:${key}`,subjectKey:key,curriculumKey:stage,type:"core",orderIndex:i+1}));
  const assessmentKey=`${stage}-standard`;
  assessmentStructures.push({key:assessmentKey,name:`${stageLabel[stage]} Standard Assessment`,totalScore:100,academicStructureKey:"academic-year"});
  assessmentItems.forEach(x=>assessmentStructureItems.push({...x,key:`${stage}:${x.key}`,assessmentStructureKey:assessmentKey}));
  for(const c of stageClasses[stage])for(const [i,subjectKey] of c.subjects.entries()){
   const key=`${c.key}:${subjectKey}`;
   classSubjects.push({key,classKey:c.key,subjectKey,curriculumSubjectKey:`${stage}:${subjectKey}`,academicStructureKey:"academic-year",orderIndex:i+1});
   assessmentApplicabilities.push({key,classSubjectKey:key,assessmentStructureKey:assessmentKey,gradingSystemKey:"percentage"});
  }
 }
 return {
  code,version:2,name:stages.map(x=>stageLabel[x]).join(" + "),organizations,
  academicStructures:[{key:"academic-year",name:"Academic Year",level:classes[0]?.level??"primary"}],
  academicPeriods:defaultPeriods.map(p=>({...p,academicStructureKey:"academic-year"})),
  classes:classes.map(({subjects,...c})=>c), subjects,curriculums,curriculumPathways:pathways,
  curriculumSubjects,subjectPrerequisites:[],classSubjects,
  gradingSystems:[{key:"percentage",name:"Percentage Grading",type:"percentage",default:true}],
  gradeRules:percentageGrades.map(g=>({...g,gradingSystemKey:"percentage"})),
  assessmentStructures,assessmentStructureItems,assessmentApplicabilities,
 };
}
