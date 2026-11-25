"use client";
import { encryptSchoolArchive } from "./archive";
import { captureAccountScopedSchoolBackup } from "./accountScopedSnapshot";
import { inspectEncryptedBackup, validateSnapshot } from "./backupVerification";
import { assertDriveSnapshotIsolation } from "./driveIsolation";

import { apiClient } from "../api/apiClient";
const base="/drive-connection";
export type DriveBackup={id:string;name:string;createdTime?:string;size?:string};
export const driveStatus=()=>apiClient<{connected:boolean;status:string}>(base+"/status");
export const authorizeDrive=()=>apiClient<{authorizationUrl:string}>(base+"/begin",{method:"POST"});
export const disconnectDrive=()=>apiClient<{connected:boolean}>(base+"/disconnect",{method:"POST"});
export const validateDrive=()=>apiClient<{connected:boolean}>(base+"/validate",{method:"POST"});
export const listDriveBackups=()=>apiClient<DriveBackup[]>(base+"/backups");
export async function downloadDriveBackup(id:string){return (await apiClient<{encrypted:string}>(base+"/backups/"+encodeURIComponent(id))).encrypted;}
export async function uploadEncryptedDriveBackup(args:{databaseName:string;accountId:string;passphrase:string}){
 const snapshot=await captureAccountScopedSchoolBackup(args.databaseName,args.accountId);
 const expected=validateSnapshot(snapshot,args.databaseName);
 assertDriveSnapshotIsolation(snapshot,args.accountId);
 const encrypted=JSON.stringify(await encryptSchoolArchive(snapshot,args.passphrase));
 if(new Blob([encrypted]).size>1500000)throw new Error("Backup exceeds the current 1.5 MB gateway limit. Use local encrypted download instead.");
 const file=await apiClient<{id:string;name:string}>(base+"/backups",{method:"POST",body:{encrypted}});
 const downloaded=await downloadDriveBackup(file.id);
 if(downloaded!==encrypted)throw new Error("Drive backup byte verification failed.");
 const verified=await inspectEncryptedBackup(downloaded,args.passphrase,args.databaseName);
 if(verified.records!==expected.records||verified.tables!==expected.tables||verified.createdAt!==expected.createdAt)throw new Error("Remote backup verification failed.");
 return {...file,...verified,bytes:new Blob([downloaded]).size};
}
