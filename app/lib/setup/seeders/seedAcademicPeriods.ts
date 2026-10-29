import type {SeedContext,SeedDefinition} from "../types";
import {mustId,upsertSeed} from "../seedUtils";
const iso=(d:Date)=>d.toISOString().slice(0,10);
export async function seedAcademicPeriods(ctx:SeedContext,defs:SeedDefinition[]){
 const begin=new Date(`${ctx.academicYearStart}T12:00:00Z`);
 const finish=new Date(`${ctx.academicYearEnd}T12:00:00Z`);
 const days=Math.floor((finish.getTime()-begin.getTime())/86400000)+1;
 for(const d of defs){
  const index=Math.max(0,Math.min(2,Number(d.order??1)-1));
  const from=new Date(begin.getTime()+Math.floor(days*index/3)*86400000);
  const to=new Date(begin.getTime()+(Math.floor(days*(index+1)/3)-1)*86400000);
  await upsertSeed(ctx,"academicPeriods",d,{...d,key:undefined,academicStructureId:mustId(ctx,"academicStructures",d.academicStructureKey),startDate:d.startDate??iso(from),endDate:d.endDate??iso(to)});
 }
}
