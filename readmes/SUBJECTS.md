Short answer: yes—“CurriculumSubject” is generally better than just “Subject” in your kind of system.
But it depends on what you’re modeling, so here’s the real reasoning:
Why “Subject” is weaker
“Subject” is too generic. In a school system it can mean many things:


a national subject (Math, English)


a timetable subject


a class offering


an assessment subject


even a UI filter label


That ambiguity is exactly how bugs creep into systems like yours (you’ve already been fighting filtering issues).

Why “CurriculumSubject” is stronger
“CurriculumSubject” is explicit and scoped. It tells you:


this subject belongs to a curriculum framework


it’s not just a label—it’s a structured academic definition


it can carry metadata like:


grade level applicability


competencies/standards


assessment mapping


progression rules




So in your architecture:

CurriculumSubject → defines WHAT is taught in a structured curriculum layer
Subject → becomes ambiguous and overloaded


The important design win in your case
Given your system already has things like:


AssessmentApplicability


AssessmentStructure


GradingSystem


Enrollment logic


Class + academic structure complexity


You are clearly building a curriculum-driven data model, not a simple school register.
So naming it:


CurriculumSubject = correct abstraction layer


Subject = leaky abstraction risk



One warning (important)
Don’t overuse long names everywhere.
A good pattern is:


CurriculumSubject (domain definition)


SubjectOffering or ClassSubject (instance in a class/term)


StudentSubjectEnrollment (relationship)


If everything becomes “CurriculumSomething”, your system becomes verbose and harder to scan.

Verdict
✔ Yes, “CurriculumSubject” is better for your architecture
❗ But keep it only for the curriculum definition layer—not everywhere

If you want, I can help you map your entire naming system cleanly (Subject vs Offering vs Enrollment vs Applicability) so everything stops fighting your filters.


Next i will create class subject table especially to support class subject which is commmon for JHS etx.