perfect! now  we ar going to upgrade so many files to match the upgraded students.tsx file. understanf that the students.tsx file is the golden standard in css, ensuring that you have create local uplatelocal, softdelte etc, in all files i send and ignore all css from other file and ensut atha it mathies the pattern in the students.tsx. the student.tsx supercedes all tell me if you understand? weh you tell me then i will start send ing you the files to fix and upgrade

Yes, I understand completely.

The uploaded Students.tsx is now the golden standard and supersedes the design patterns from the other modules.

When you send a file, I will preserve its business logic and data behavior, but upgrade it to follow the Students pattern:

What I WILL standardize
1. Search & Actions Bar
Wide search box
Inline + add button
Slider-style filter button
⋯ more menu
No floating add button
No duplicate module headers/titles
No large summary strips
2. CRUD Data Pattern

Use the same local-first sync utilities:

createLocal(...)
updateLocal(...)
softDeleteLocal(...)
listActiveLocal(...)

instead of ad-hoc CRUD approaches where possible.

3. Delete Behavior

Use:

softDeleteLocal(...)

instead of hard delete.

4. Lookup Tables

Use:

listActiveLocal(...)

for:

classes
subjects
organizations
departments
houses
programs
etc.

instead of loading deleted/inactive records.

5. Mobile-First Layout
compact cards
clean spacing
horizontal action buttons
responsive tables
no desktop-first layouts
dark mode via theme variables only
6. Action Sheets

Use Students-style:

MoreSheet
FilterSheet
ActionSheet

instead of large desktop toolbars.

7. Status Display
small colored status dots
compact chips where necessary
no giant status blocks
8. Theme System

Use:

var(--bg)
var(--surface)
var(--card-bg)
var(--text)
var(--muted)
var(--border)
var(--primary-color)

No hardcoded light-mode colors.

9. Table View
Students(x) style header
horizontal action buttons
no extra summary area above table
10. Consistency

Every upgraded module should feel like it belongs to the same product family as Students.tsx.

What I will NOT change
Existing database schema
Existing business logic
Existing permissions
Existing routing
Existing role restrictions
Existing sync architecture
Existing calculations

Unless you explicitly ask for those changes.

So from now on my workflow is:

Keep the module's functionality → replace its UI/UX structure with the Students.tsx standard.

Send the first file and I'll upgrade it to match the Students standard.