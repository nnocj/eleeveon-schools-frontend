export const TERMS = ["Term 1", "Term 2", "Term 3"];

export const nextTerm = (term: string) => {
  const index = TERMS.indexOf(term);
  return index < TERMS.length - 1 ? TERMS[index + 1] : null;
};

export const nextAcademicYear = (year: string) => {
  const [start, end] = year.split("/").map(Number);
  return `${start + 1}/${end + 1}`;
};