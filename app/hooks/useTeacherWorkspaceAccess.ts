"use client";
/** Teacher portal assignment resolver — UI-level scoping only.
 * Server routes/sync MUST independently validate teacher assignments.
 * Account, school and branch come from the selected role workspace.
 */
import { useEffect, useMemo, useState } from "react";
import { useBranchWorkspaceScope } from "../../hooks/useBranchWorkspaceScope";
import { useActiveMembership } from "../../context/active-membership-context";
import { useBranchTableRevision } from "../../hooks/useBranchTableRevision";
import { db } from "../../lib/db/db";

export const asId = (v: unknown) => v == null ? "" : String(v).trim();
export const idsEqual = (a: unknown, b: unknown) => !!asId(a) && asId(a) === asId(b);
function currentWorkspace(): any {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem("eleeveon_open_workspace") || window.sessionStorage.getItem("eleeveon_open_workspace") || "{}"); }
  catch { return {}; }
}
function usable(row: any, accountId: string, schoolId: string, branchId: string) {
  // A missing scope is not evidence of permission: fail closed on assignments.
  return !!row && row.isDeleted !== true && row.active !== false &&
    idsEqual(row.accountId, accountId) && idsEqual(row.schoolId, schoolId) && idsEqual(row.branchId, branchId);
}
export function useTeacherWorkspaceAccess() {
  const workspace = useBranchWorkspaceScope();
  const { activeMembership } = useActiveMembership() as any;
  const revision = useBranchTableRevision(["classSubjects","classTeachers","studentEnrollments","teachers"]);
  const { accountId, schoolId, branchId, authenticated, restoring, branchLoading } = workspace;
  const ws = useMemo(currentWorkspace, [accountId, schoolId, branchId]);
  const membership = ws?.membership || activeMembership || {};
  const role = String(ws?.role || membership.role || "").toLowerCase().trim();
  const teacherId = asId(ws?.teacherId || membership.teacherLocalId || membership.teacherId || membership.teacher?.id || (activeMembership as any)?.teacherLocalId || (activeMembership as any)?.teacherId);
  const [assigned, setAssigned] = useState<{ready:boolean; subjects:Set<string>; classes:Set<string>; teachingClasses:Set<string>; error?:string}>({ready:false,subjects:new Set(),classes:new Set(),teachingClasses:new Set()});
  useEffect(() => {
    let cancelled=false;
    setAssigned({ready:false,subjects:new Set(),classes:new Set(),teachingClasses:new Set()});
    if (!authenticated || role!=="teacher" || !teacherId || !accountId || !schoolId || !branchId) {
      setAssigned({ready:true,subjects:new Set(),classes:new Set(),teachingClasses:new Set()});
      return;
    }
    Promise.all([(db as any).classSubjects.toArray(),(db as any).classTeachers.toArray()]).then(([subjects,classes])=>{
      if(cancelled)return;
      const ownedSubjects=(subjects as any[]).filter(r=>usable(r,asId(accountId),asId(schoolId),asId(branchId))&&idsEqual(r.teacherId,teacherId));
      const ownedClasses=(classes as any[]).filter(r=>usable(r,asId(accountId),asId(schoolId),asId(branchId))&&idsEqual(r.teacherId,teacherId));
      const subjectIds=new Set<string>(ownedSubjects.map(r=>asId(r.id)).filter(Boolean));
      const classIds=new Set<string>(ownedClasses.map(r=>asId(r.classId)).filter(Boolean));
      const teachingClassIds=new Set<string>(ownedSubjects.map(r=>asId(r.classId)).filter(Boolean));
      setAssigned({ready:true,subjects:subjectIds,classes:classIds,teachingClasses:teachingClassIds});
    }).catch((e)=>{if(!cancelled)setAssigned({ready:true,subjects:new Set(),classes:new Set(),teachingClasses:new Set(),error:String(e)});});
    return()=>{cancelled=true};
  },[authenticated,role,teacherId,accountId,schoolId,branchId,revision]);
  const allowedClassIds=useMemo(()=>new Set([...assigned.classes,...assigned.teachingClasses]),[assigned.classes,assigned.teachingClasses]);
  const permitted=!!authenticated && role==="teacher" && !!teacherId && !!accountId && !!schoolId && !!branchId;
  return {accountId:asId(accountId),schoolId:asId(schoolId),branchId:asId(branchId),teacherId,permitted,
    ready:!restoring&&!branchLoading&&assigned.ready,error:assigned.error,
    classTeacherClassIds:assigned.classes,teachingClassIds:assigned.teachingClasses,
    allowedClassIds,subjectIds:assigned.subjects};
}
/** Recheck live assignment immediately before a mutation. */
export async function verifyTeacherSubjectAssignment(identity:{accountId:string;schoolId:string;branchId:string;teacherId:string}, subjectId:string) {
  const rows=await (db as any).classSubjects.toArray();
  return rows.some((r:any)=>usable(r,identity.accountId,identity.schoolId,identity.branchId)&&idsEqual(r.teacherId,identity.teacherId)&&idsEqual(r.id,subjectId));
}
/** A teacher may update student demographics only if currently assigned to an active enrollment's class. */
export async function verifyTeacherStudentAssignment(identity:{accountId:string;schoolId:string;branchId:string;teacherId:string},studentId:string){
  const [enrollments, subjects, classTeachers]=await Promise.all([(db as any).studentEnrollments.toArray(),(db as any).classSubjects.toArray(),(db as any).classTeachers.toArray()]);
  const allowed=new Set<string>([
   ...subjects.filter((r:any)=>usable(r,identity.accountId,identity.schoolId,identity.branchId)&&idsEqual(r.teacherId,identity.teacherId)).map((r:any)=>asId(r.classId)),
   ...classTeachers.filter((r:any)=>usable(r,identity.accountId,identity.schoolId,identity.branchId)&&idsEqual(r.teacherId,identity.teacherId)).map((r:any)=>asId(r.classId)),
  ]);
  return (enrollments as any[]).some((r:any)=>usable(r,identity.accountId,identity.schoolId,identity.branchId)&&idsEqual(r.studentId,studentId)&&r.status==="active"&&allowed.has(asId(r.classId)));
}

/** Fresh class-teacher authorization before writing remarks/attendance. */
export async function verifyTeacherClassAssignment(identity:{accountId:string;schoolId:string;branchId:string;teacherId:string}, classId:string){
 const rows=await (db as any).classTeachers.toArray();
 return rows.some((r:any)=>usable(r,identity.accountId,identity.schoolId,identity.branchId)&&idsEqual(r.teacherId,identity.teacherId)&&idsEqual(r.classId,classId));
}
