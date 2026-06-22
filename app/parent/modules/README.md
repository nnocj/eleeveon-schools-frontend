# Parent Portal Calendar + Timetable + Communication Modules

Drop these files into:

```txt
app/parent/modules/
```

Files included:

```txt
Calendar.tsx
ChildTimetable.tsx
Announcements.tsx
Messages.tsx
```

Add imports/routes in `app/parent/page.tsx` as needed:

```ts
import Calendar from "./modules/Calendar";
import ChildTimetable from "./modules/ChildTimetable";
import Announcements from "./modules/Announcements";
import Messages from "./modules/Messages";
```

These are parent-scoped modules. Announcements are receive-only. Messages allow parent conversations with allowed school contacts.
