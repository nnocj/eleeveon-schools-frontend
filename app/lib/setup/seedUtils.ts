import type {SeedContext,SeedDefinition,SeedEntityName} from "./types";
export const seedMeta=(ctx:SeedContext,table:SeedEntityName,key:string)=>({setupSource:"seeded",setupTemplateCode:ctx.templateCode,setupTemplateVersion:ctx.templateVersion,setupSeedKey:`${table}:${key}`});
const naturalFields:Partial<Record<SeedEntityName,string[]>>={
 academicStructures:["name"],academicPeriods:["academicStructureId","name"],
 classes:["code"],subjects:["code"],organizations:["name"],
 curriculums:["code"],curriculumPathways:["curriculumId","code"],
 curriculumSubjects:["curriculumId","subjectId"],
 classSubjects:["classId","subjectId"],gradingStructures:["name"],
 gradeRules:["gradingStructureId","grade"],
 assessmentStructures:["name"],assessmentStructureItems:["assessmentStructureId","name"],
 assessmentApplicabilities:["classSubjectId"],subjectPrerequisites:["curriculumSubjectId","prerequisiteSubjectId"],
};
export async function findSeedExisting(ctx:SeedContext,table:SeedEntityName,definition:SeedDefinition,payload:Record<string,unknown>){
 const scope={accountId:ctx.accountId,schoolId:ctx.schoolId,branchId:ctx.branchId};
 const key=`${table}:${definition.key}`;
 // First match the current or previous template; do not match deleted records.
 const old=await ctx.store.findOne(table,{...scope,setupSeedKey:key});
 if(old&&!old.isDeleted)return old;
 const fields=naturalFields[table]||[];
 if(fields.length&&fields.every(f=>payload[f]!==undefined&&payload[f]!==null&&payload[f]!=="")){
  const match=await ctx.store.findOne(table,{...scope,...Object.fromEntries(fields.map(f=>[f,payload[f]]))});
  if(match&&!match.isDeleted)return match;
 }
 return undefined;
}
export async function upsertSeed(ctx:SeedContext,table:SeedEntityName,definition:SeedDefinition,payload:Record<string,unknown>):Promise<string>{
 const existing=await findSeedExisting(ctx,table,definition,payload);
 if(existing){
  ctx.ids[table][definition.key]=String(existing.id);ctx.counts[table].reused++;
  const missing=Object.fromEntries(Object.entries(payload).filter(([k,v])=>v!==undefined&&(existing as Record<string,unknown>)[k]===undefined));
  if(Object.keys(missing).length&&ctx.store.update)await ctx.store.update(table,String(existing.id),missing);
  return String(existing.id);
 }
 const created=await ctx.store.create(table,{accountId:ctx.accountId,schoolId:ctx.schoolId,branchId:ctx.branchId,...payload,...seedMeta(ctx,table,definition.key),active:payload.active??true});
 ctx.ids[table][definition.key]=String(created.id);ctx.counts[table].created++;return String(created.id);
}
export function mustId(ctx:SeedContext,table:SeedEntityName,key:unknown):string{
 if(typeof key!=="string")throw new Error(`Missing reference key for ${table}`);
 const id=ctx.ids[table][key];if(!id)throw new Error(`Unresolved ${table} seed key: ${key}`);return id;
}
