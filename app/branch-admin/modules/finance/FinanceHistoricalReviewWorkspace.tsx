"use client";
/** Historical review in Finance, read-only by design. */
import React, {useEffect,useState} from "react";
import {listActiveLocal} from "../../../lib/sync/syncUtils";
import type {Student} from "../../../lib/db/db";
import {useBranchWorkspaceScope} from "../../../hooks/useBranchWorkspaceScope";
import {useBranchTableRevision} from "../../../hooks/useBranchTableRevision";
import FinanceHistoricalImportReview from "../../../components/excel/FinanceHistoricalImportReview";
export default function FinanceHistoricalReviewWorkspace(){
 const {accountId,schoolId,branchId}=useBranchWorkspaceScope();
 const revision=useBranchTableRevision(["students"]);
 const [students,setStudents]=useState<Student[]>([]);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{let cancelled=false;
  if(!accountId||!schoolId||!branchId){setStudents([]);setLoading(false);return;}
  setLoading(true);
  listActiveLocal<Student>("students").then(rows=>{
    if(cancelled)return;
    setStudents((rows||[]).filter(row=>row.accountId===accountId&&row.schoolId===schoolId&&row.branchId===branchId));
  }).catch(error=>{console.error("Historical review: students",error);if(!cancelled)setStudents([]);})
   .finally(()=>{if(!cancelled)setLoading(false)});
  return ()=>{cancelled=true};
 },[accountId,schoolId,branchId,revision]);
 if(!accountId||!schoolId||!branchId)return <p>Select a school and branch first.</p>;
 if(loading)return <p>Loading student records…</p>;
 return <FinanceHistoricalImportReview students={students} accountId={accountId} schoolId={schoolId} branchId={branchId}/>;
}
