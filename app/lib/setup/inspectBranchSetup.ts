import type {SeedBranchOptions,SeedEntityName} from "./types";
import {getSetupTemplate} from "./templates";
export async function inspectBranchSetup(options:SeedBranchOptions){
 const t=getSetupTemplate(options.templateCode);
 const result:Partial<Record<SeedEntityName,{expected:number;found:number;missing:string[]}>>={};
 const names=Object.keys(t).filter(k=>Array.isArray((t as unknown as Record<string,unknown>)[k])) as SeedEntityName[];
 for(const table of names){
  const definitions=t[table] as {key:string}[];const missing:string[]=[];let found=0;
  for(const d of definitions){
   const row=await options.store.findOne(table,{accountId:options.accountId,schoolId:options.schoolId,branchId:options.branchId,setupSeedKey:`${table}:${d.key}`});
   if(row&&!row.isDeleted)found++;else missing.push(d.key);
  }
  result[table]={expected:definitions.length,found,missing};
 }
 return result;
}
