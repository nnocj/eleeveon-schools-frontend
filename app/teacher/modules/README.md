# Teacher Portal Calendar + Timetable + Communication Modules

Drop these files into:

```txt
app/teacher/modules/
```

Files included:

```txt
Calendar.tsx
MyTimetable.tsx
ClassTimetable.tsx
Announcements.tsx
Messages.tsx
```

Add imports/routes in `app/teacher/page.tsx` as needed:

```ts
import Calendar from "./modules/Calendar";
import MyTimetable from "./modules/MyTimetable";
import ClassTimetable from "./modules/ClassTimetable";
import Announcements from "./modules/Announcements";
import Messages from "./modules/Messages";
```

These are teacher-scoped modules. They resolve the teacher from membership/email where possible and only expose branch/teacher relevant data.
