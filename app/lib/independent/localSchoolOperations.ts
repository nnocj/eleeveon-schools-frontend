/** Independently scoped operations on the EXISTING EleeveonDB tables.
 * No API requests, Cloud auth tokens or alternate student database.
 * SECURITY: Browser-side checks are not an anti-tamper authorization boundary.
 * Release requires OS-protected native storage and native-side permission enforcement.
 */
import { SyncStatus } from '../constants/syncStatus';
import { db, openAppDatabase, type Branch, type Class, type School, type Student, type Teacher } from '../db/db';
import type { OfflineLicenseClaims } from './offlineLicense';
import {LOCAL_WRITE_ROLES,requiredText,withinLicenseLimit,correctScope} from './localSchoolRules';
import { requireLocalSession, type LocalRole } from './localStaffAuth';

export type LocalSchoolScope = {accountId:string; schoolId:string; branchId:string};
export type LocalSchoolSummary = { schools:School[]; branches:Branch[]; classes:Class[]; students:Student[]; teachers:Teacher[] };
type Entity = 'schools'|'branches'|'classes'|'students'|'teachers';
const stamp=(accountId:string) => {const now=Date.now(), id=crypto.randomUUID(), deviceId='independent-local';return {id,accountId,createdAt:now,updatedAt:now,version:1,deviceId,createdByDeviceId:deviceId,updatedByDeviceId:deviceId,synced:SyncStatus.PENDING,isDeleted:false};};
export function assertLocalPermission(accountId:string,roles:readonly LocalRole[]){return requireLocalSession(accountId,[...roles]);}
export async function openLicensedLocalDatabase(license:OfflineLicenseClaims){
 if(!license.accountId)throw new Error('Missing verified account identifier');
 requireLocalSession(license.accountId);
 // The only exported EleeveonDB singleton; no parallel schema or alternate record store.
 await openAppDatabase();
 const foreign=await db.schools.filter(s=>!s.isDeleted&&s.accountId!==license.accountId).first();
 if(foreign)throw new Error('This database belongs to another account. Do not merge school databases between installations.');
 return db;
}
export async function readLocalSchoolSummary(license:OfflineLicenseClaims, scope?:Partial<LocalSchoolScope>):Promise<LocalSchoolSummary>{
 await openLicensedLocalDatabase(license);
 const matches=(x:{accountId:string;schoolId?:string;branchId?:string;isDeleted:boolean})=>!x.isDeleted&&x.accountId===license.accountId&&(!scope?.schoolId||x.schoolId===scope.schoolId)&&(!scope?.branchId||x.branchId===scope.branchId);
 const [schools,branches,classes,students,teachers]=await Promise.all([db.schools.toArray(),db.branches.toArray(),db.classes.toArray(),db.students.toArray(),db.teachers.toArray()]);
 return {schools:schools.filter(s=>!s.isDeleted&&s.accountId===license.accountId),branches:branches.filter(matches),classes:classes.filter(matches),students:students.filter(matches),teachers:teachers.filter(matches)};
}
async function assertWithinLimit(table:Entity, license:OfflineLicenseClaims){
 const limit=({schools:license.limits.schools,branches:license.limits.branches,classes:null,students:license.limits.students,teachers:license.limits.teachers} as Record<Entity,number|null>)[table];
 if(limit===null)return;
 const rows=await db[table].toArray();
 if(!withinLicenseLimit(rows.filter(row=>correctScope(row,{accountId:license.accountId})).length,limit))throw new Error(`License ${table} limit reached (${limit})`);
}
async function existingScope(license:OfflineLicenseClaims,schoolId:string,branchId?:string){
 const school=await db.schools.get(schoolId);
 if(!school||school.isDeleted||school.accountId!==license.accountId)throw new Error('School does not belong to this licensed account');
 if(branchId){const branch=await db.branches.get(branchId);if(!branch||branch.isDeleted||branch.accountId!==license.accountId||branch.schoolId!==schoolId)throw new Error('Invalid licensed school branch');}
}
export async function addLocalSchool(license:OfflineLicenseClaims,name:string){
 assertLocalPermission(license.accountId,LOCAL_WRITE_ROLES.schools);await openLicensedLocalDatabase(license);
 return db.transaction('rw',db.schools,async()=>{await assertWithinLimit('schools',license);const school:School={...stamp(license.accountId),name:requiredText(name,'School name')};await db.schools.add(school);return school;});
}
export async function addLocalBranch(license:OfflineLicenseClaims,schoolId:string,name:string){
 assertLocalPermission(license.accountId,LOCAL_WRITE_ROLES.branches);await openLicensedLocalDatabase(license);
 return db.transaction('rw',db.schools,db.branches,async()=>{await existingScope(license,schoolId);await assertWithinLimit('branches',license);const branch:Branch={...stamp(license.accountId),schoolId,name:requiredText(name,'Branch name'),active:true};await db.branches.add(branch);return branch;});
}
export async function addLocalClass(license:OfflineLicenseClaims,scope:LocalSchoolScope,name:string){
 assertLocalPermission(license.accountId,LOCAL_WRITE_ROLES.classes);await openLicensedLocalDatabase(license);
 return db.transaction('rw',db.schools,db.branches,db.classes,async()=>{await existingScope(license,scope.schoolId,scope.branchId);const existing=await db.classes.filter(c=>!c.isDeleted&&c.accountId===license.accountId&&c.branchId===scope.branchId&&c.name.toLowerCase()===name.trim().toLowerCase()).first();if(existing)throw new Error('Class already exists in this branch');const item:Class={...stamp(license.accountId),schoolId:scope.schoolId,branchId:scope.branchId,name:requiredText(name,'Class name'),active:true};await db.classes.add(item);return item;});
}
export async function addLocalStudent(license:OfflineLicenseClaims,scope:LocalSchoolScope,values:{fullName:string;currentClassId?:string;admissionNumber?:string}){
 assertLocalPermission(license.accountId,LOCAL_WRITE_ROLES.students);await openLicensedLocalDatabase(license);
 return db.transaction('rw',db.schools,db.branches,db.classes,db.students,async()=>{
  await existingScope(license,scope.schoolId,scope.branchId);await assertWithinLimit('students',license);
  if(values.currentClassId){const cls=await db.classes.get(values.currentClassId);if(!cls||cls.isDeleted||cls.schoolId!==scope.schoolId||cls.branchId!==scope.branchId||cls.accountId!==license.accountId)throw new Error('Class is outside the active branch');}
  const admission=values.admissionNumber?.trim();
  if(admission){const duplicate=await db.students.filter(s=>!s.isDeleted&&s.accountId===license.accountId&&s.admissionNumber?.toLowerCase()===admission.toLowerCase()).first();if(duplicate)throw new Error('Admission number already assigned to a student');}
  const student:Student={...stamp(license.accountId),schoolId:scope.schoolId,branchId:scope.branchId,fullName:requiredText(values.fullName,'Student name'),currentClassId:values.currentClassId||undefined,admissionNumber:admission||undefined,status:'active'};
  await db.students.add(student);return student;
 });
}
export async function addLocalTeacher(license:OfflineLicenseClaims,scope:LocalSchoolScope,fullName:string){
 assertLocalPermission(license.accountId,LOCAL_WRITE_ROLES.teachers);await openLicensedLocalDatabase(license);
 return db.transaction('rw',db.schools,db.branches,db.teachers,async()=>{await existingScope(license,scope.schoolId,scope.branchId);await assertWithinLimit('teachers',license);const teacher:Teacher={...stamp(license.accountId),schoolId:scope.schoolId,branchId:scope.branchId,fullName:requiredText(fullName,'Teacher name'),title:'',role:'teacher',active:true};await db.teachers.add(teacher);return teacher;});
}
/** Soft delete only; never silently destroy school records or associated media. */
export async function deactivateLocalStudent(license:OfflineLicenseClaims,scope:LocalSchoolScope,id:string){
 assertLocalPermission(license.accountId,LOCAL_WRITE_ROLES.students);await openLicensedLocalDatabase(license);
 return db.transaction('rw',db.students,async()=>{const row=await db.students.get(id);if(!row||row.isDeleted||row.accountId!==license.accountId||row.schoolId!==scope.schoolId||row.branchId!==scope.branchId)throw new Error('Student outside authorized branch');await db.students.update(id,{isDeleted:true,updatedAt:Date.now(),version:row.version+1,synced:SyncStatus.PENDING});});
}
