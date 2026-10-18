/** app/lib/excel/students/protectedStudentWorkbook.ts
 * Styled, protected workbook writer. Needs exceljs installed (already used by
 * protected assessment export). Styles aid users; validation remains authoritative.
 */
import type { ExcelExportWorkbook } from "../excelTypes";
const C={navy:"19345C",white:"FFFFFF",green:"E5F5E9",grey:"EDF0F4",amber:"FFF1CF",blue:"DDEBFF",border:"D6DEE9"};
export async function downloadProtectedStudentWorkbook(definition:ExcelExportWorkbook, options: { readOnly?: boolean } = {}):Promise<void> {
 if(typeof document === "undefined") throw new Error("Student Excel template export requires a browser.");
 const imported=await import("exceljs");
 const ExcelJS=imported.default??imported;
 const book=new ExcelJS.Workbook();book.creator="Eleeveon Schools";book.subject="Student import template";
 for(const def of definition.sheets){
  const sheet=book.addWorksheet(def.name.slice(0,31)||"Students");
  for(const row of def.preambleRows||[]) sheet.addRow(row);
  if(def.preambleRows?.length) for(let i=0;i<Math.max(0,def.preambleSpacing??1);i++) sheet.addRow([]);
  const headerNumber=sheet.rowCount+1;
  sheet.addRow(def.columns.map(c=>c.header));
  for(const [idx,record] of def.rows.entries()) sheet.addRow(def.columns.map(c=>c.value?c.value(record,idx):record[c.key]));
  // Blank, preformatted rows make the template immediately usable offline.
  const inputStart=headerNumber+1;
  if (!options.readOnly) for(let i=def.rows.length;i<Math.max(100,def.rows.length);i++)sheet.addRow(def.columns.map(()=>null));
  def.columns.forEach((c,index)=>sheet.getColumn(index+1).width=Math.max(10,c.width??17));
  sheet.views=[{state:"frozen",ySplit:headerNumber,xSplit:1}];
  sheet.getRow(headerNumber).height=30;
  for(let r=1;r<=sheet.rowCount;r++){
   const row=sheet.getRow(r);
   for(let col=1;col<=def.columns.length;col++){
    const cell=row.getCell(col);
    cell.protection={locked:options.readOnly || r<inputStart};
    cell.alignment={vertical:"middle",wrapText:r<=headerNumber};
    cell.border={bottom:{style:"hair",color:{argb:C.border}}};
    if(r===headerNumber){cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:C.navy}};cell.font={color:{argb:C.white},bold:true};}
    else if(r<headerNumber){cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:r===1?C.blue:String(row.getCell(1).value||"").toLowerCase()==="instructions"?C.amber:C.grey}}; if(r===1)cell.font={bold:true,color:{argb:C.navy},size:14};}
    else {cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:options.readOnly?C.grey:C.green}};cell.numFmt="@";}
   }
  }
  // Preserve leading zeros in admission numbers and phone numbers.
  for(const key of ["admissionNumber","parentPhone"]){const i=def.columns.findIndex(c=>c.key===key)+1;if(i)sheet.getColumn(i).numFmt="@";}
  const last=sheet.rowCount;
  const gender=def.columns.findIndex(c=>c.key==="gender")+1;
  const status=def.columns.findIndex(c=>c.key==="status")+1;
  const age=def.columns.findIndex(c=>c.key==="age")+1;
  for(let r=inputStart;r<=last;r++){
   if(!options.readOnly && gender)sheet.getCell(r,gender).dataValidation={type:"list",allowBlank:true,formulae:['"Male,Female"']};
   if(!options.readOnly && status)sheet.getCell(r,status).dataValidation={type:"list",allowBlank:true,formulae:['"active,graduated,transferred,withdrawn"']};
   if(!options.readOnly && age)sheet.getCell(r,age).dataValidation={type:"whole",operator:"between",allowBlank:true,formulae:[0,120],showErrorMessage:true,error:"Age must be from 0 to 120."};
  }
  await sheet.protect("eleeveon-student-template",{selectLockedCells:true,selectUnlockedCells:true,formatCells:false,insertColumns:false,deleteColumns:false,deleteRows:false});
 }
 const bytes=await book.xlsx.writeBuffer();
 const blob=new Blob([bytes as BlobPart],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
 const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=definition.fileName.endsWith(".xlsx")?definition.fileName:`${definition.fileName}.xlsx`;
 document.body.appendChild(link);try{link.click();}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60000);}
}
