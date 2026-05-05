export function calculateCA(classTest: number, project: number) {
  const ca = classTest + project; // /60
  return ca;
}

export function calculateCAWeighted(classTest: number, project: number) {
  const ca = calculateCA(classTest, project);
  return (ca / 60) * 50;
}

export function calculateExamWeighted(exam: number) {
  return (exam / 100) * 50;
}

export function calculateFinalScore(
  classTest: number,
  project: number,
  exam: number
) {
  const caPart = calculateCAWeighted(classTest, project);
  const examPart = calculateExamWeighted(exam);

  return Number((caPart + examPart).toFixed(2));
}


