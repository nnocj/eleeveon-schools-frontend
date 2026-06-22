# Owner Portal Calendar Overview + Messages Modules

Drop these files into:

```txt
app/owner/modules/
```

Files included:

```txt
CalendarOverview.tsx
Messages.tsx
```

Suggested imports/routes in `app/owner/page.tsx`:

```ts
import CalendarOverview from "./modules/CalendarOverview";
import Messages from "./modules/Messages";

const ROUTES = {
  calendarOverview: CalendarOverview,
  messages: Messages,
};
```

Notes:
- `CalendarOverview.tsx` is view-only across owned schools and branches.
- `Messages.tsx` supports executive communication with school admins and branch admins.
- Both modules use `accountId` ownership scope and avoid operational timetable editing.
