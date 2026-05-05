export function rankByTotal(scores: any[]) {
  const sorted = [...scores].sort((a, b) => b.total - a.total);

  return sorted.map((s, index) => ({
    studentId: s.studentId,
    position: index + 1,
  }));
}

export function calculateStudentAverages(scores: any[]) {
  const map: any = {};

  scores.forEach((s) => {
    if (!map[s.studentId]) {
      map[s.studentId] = {
        total: 0,
        count: 0,
      };
    }

    map[s.studentId].total += s.total;
    map[s.studentId].count += 1;
  });

  return Object.keys(map).map((studentId) => ({
    studentId: Number(studentId),
    average: map[studentId].total / map[studentId].count,
  }));
}

export function rankOverall(scores: any[]) {
  const averages = calculateStudentAverages(scores);

  const sorted = averages.sort((a, b) => b.average - a.average);

  return sorted.map((s, index) => ({
    studentId: s.studentId,
    position: index + 1,
    average: s.average,
  }));
}