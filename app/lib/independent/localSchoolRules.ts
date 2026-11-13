/** Pure, testable domain rules. Native-side enforcement is still required for release. */
import type {LocalRole} from './localStaffAuth';
export type LocalSchoolEntity='schools'|'branches'|'classes'|'students'|'teachers';
export const LOCAL_WRITE_ROLES:Readonly<Record<LocalSchoolEntity,readonly LocalRole[]>>={
 schools:['owner'],branches:['owner'],classes:['owner','branch_admin'],students:['owner','branch_admin'],teachers:['owner','branch_admin']
};
export function canWriteLocalEntity(role:LocalRole,entity:LocalSchoolEntity):boolean{return LOCAL_WRITE_ROLES[entity].includes(role);}
export function requiredText(value:string,label:string):string{const v=value.trim();if(v.length<1||v.length>180)throw new Error(`${label} must be 1–180 characters`);return v;}
export function withinLicenseLimit(currentCount:number,limit:number|null):boolean{
 return Number.isSafeInteger(currentCount)&&currentCount>=0&&(limit===null||(Number.isSafeInteger(limit)&&limit>=0&&currentCount<limit));
}
export function correctScope(row:{accountId:string;schoolId?:string;branchId?:string;isDeleted:boolean},expected:{accountId:string;schoolId?:string;branchId?:string}):boolean{
 return !row.isDeleted && row.accountId===expected.accountId && (expected.schoolId===undefined||row.schoolId===expected.schoolId)&&(expected.branchId===undefined||row.branchId===expected.branchId);
}
