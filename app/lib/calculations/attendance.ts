export function calculateExpectedDays(term: any) {
  // simplified logic placeholder
  return term.expectedDays;
}

export function calculateStudentAttendance(
  presentDays: number,
  expectedDays: number
) {
  return {
    presentDays,
    expectedDays,
    percentage: Number(((presentDays / expectedDays) * 100).toFixed(1)),
  };
}