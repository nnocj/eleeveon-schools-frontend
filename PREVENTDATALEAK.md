So far I understand that everything ties to the accountid so to prevent a situation where
because its a pwa, we still get to view pages because indexdb.ts remembers them. I think a
leading cause of this is that active-schoolbranch context works seperately from  the auth-context.
So now the fix will be to make the accountId a requirement in the school branch so without it it doesn't work.

Also aside from the context handling login when login is clicked each page should do their own job of preventing any view except login account id and school branch is present. Which we know that I'm also handling it from that direction. So together these forces makes it impossible to view by mainstream users.


I understand the problem: logout clears the account, but IndexedDB and remembered school/branch context can still let pages render after refresh. The fix is to make accountId the master gate for every protected page and context, not just localStorage cleanup.Thought for 1m 0sYes, I understand. Since your app is a PWA, IndexedDB data can remain after logout, but the app must refuse to use it unless there is a valid logged-in accountId.
You need 3 gates:
1. Dashboard must block without accountId
At the top of your dashboard component, add this:
useEffect(() => {  if (!loading && !accountId) {    router.replace("/login");  }}, [loading, accountId, router]);if (loading) {  return <div style={{ padding: 20 }}>Checking account...</div>;}if (!accountId) {  return null;}
So before the dashboard renders schools/branches, it checks login first.

2. ActiveBranchContext must clear school/branch if accountId is gone
Inside active-branch-context.tsx, use useAccount() and add:
const { accountId, loading: accountLoading } = useAccount();useEffect(() => {  if (!accountLoading && !accountId) {    setActiveSchoolId(undefined);    setActiveBranchId(undefined);    localStorage.removeItem("activeSchoolId");    localStorage.removeItem("activeBranchId");  }}, [accountLoading, accountId]);
Also, when loading schools/branches, filter by account:
row.accountId === accountId
Not only by schoolId or branchId.

3. Every page must refuse to load DB without accountId
Every page should begin its load() like this:
if (!accountId || !schoolId || !branchId) {  setRows([]);  setPageLoading(false);  return;}
Then every DB filter must use:
const sameTenant = (row: {  accountId?: string;  schoolId?: number;  branchId?: number;  isDeleted?: boolean;}) =>  row.accountId === accountId &&  row.schoolId === schoolId &&  row.branchId === branchId &&  !row.isDeleted;

Most important: do not delete IndexedDB on logout. For a PWA, keeping offline data is okay. But the data must be unusable until login restores accountId.

So the rule is:
No accountId = no dashboard, no branch context, no page data.