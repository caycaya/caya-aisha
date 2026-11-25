# KerjaPay HRMS — System Architecture & Multi-Device Sync Specification

## 1. Centralized Dual-App Architecture

KerjaPay HRM operates as a **single-source-of-truth centralized HRMS** shared across:
- **Back Office Web Application** (`React 19 + TypeScript + Vite PWA` served by `Node.js/Express`)
- **Employee ESS Mobile Web/PWA** (built into the unified web bundle for cross-platform mobile browsers)
- **Native Android Employee Mobile App** (`Kotlin + Jetpack Compose` under `/android/`)

All clients connect to the **same Firebase project and Cloud Firestore database**:
- **Firebase Project ID**: `gen-lang-client-0038887098`
- **Cloud Firestore Database ID**: `ai-studio-kerjapayhrm-d470c31c-7780-4443-a128-dc2da419f959`
- **Cloud Storage Bucket**: `gen-lang-client-0038887098.firebasestorage.app`

```
+-----------------------------------+      +------------------------------------+
|  Back Office Web (React + TS)     |      | Native Android App (Kotlin/Compose)|
|  Super Admin / HR / Mgmt / Supv   |      | Employee Self-Service (ESS)        |
+-----------------+-----------------+      +------------------+-----------------+
                  |                                           |
                  |   Firebase Auth + Cloud Firestore SDK     |
                  +---------------------+---------------------+
                                        |
                                        v
           +---------------------------------------------------------+
           | Firebase Project: gen-lang-client-0038887098            |
           | Firestore DB: ai-studio-kerjapayhrm-...                 |
           | Enforced by firestore.rules (RBAC + Transactions + Time)|
           +---------------------------------------------------------+
```

## 2. Role-Based Access Control (RBAC) Matrix

Authorization is enforced both in UI guards (`src/types/hrms.ts`) and server-side in `firestore.rules`:

| Role | Employees | Attendance / Leave / Overtime | Payroll & Payslips | Audit Logs & Settings |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | View, Create, Edit, Delete | View, Create, Edit, Approve, Delete | View, Create, Edit, Approve, Delete (unless `Paid`) | View, Create, Edit |
| **HR Admin** | View, Create, Edit | View, Create, Edit, Approve | View, Create, Edit | Audit: View · Settings: View |
| **Management** | View | View | View, Edit, Approve (`Management Approval` → `Finalized` → `Paid`) | Audit: View · Settings: View |
| **Supervisor** | View | View, Approve team requests | Personal payslips only | None |
| **Employee** | Self profile only (verified email claim) | Self Clock-In/Out, Leave, Overtime | Personal payslips only | None |

## 3. Multi-Device Synchronization & Conflict Resolution

1. **Real-Time Listeners (`onSnapshot`)**:
   - Web (`subscribeHrmsWorkspace`) and Android (`HrmsRepository`) subscribe with `MetadataChanges.INCLUDE` so both portals reflect changes immediately without manual refreshes and display pending local writes (`hasPendingWrites`).
2. **Offline Persistence**:
   - Web uses `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`.
   - Android uses `persistentCacheSettings {}` in `FirestoreClient.kt`.
3. **Deterministic Keys & Duplicate Prevention**:
   - Daily attendance documents use deterministic ID `{employeeId}_{workDate}` (e.g., `emp_002_2026-11-24`).
   - Both Web (`submitClockIn`) and Android (`HrmsRepository.clockIn`) wrap creation inside `runTransaction`, rejecting duplicate clock-ins across concurrent devices, and `firestore.rules` enforces `attendanceId == incoming().employeeId + '_' + incoming().workDate` plus `clockInAt == request.time`.
4. **Optimistic Concurrency & Terminal State Locks**:
   - Leave & Overtime approvals use `runTransaction` verifying `current.status == 'Pending'` before transitioning, preventing double-deduction of `leave_balances/{employeeId}_{year}` when two supervisors act simultaneously.
   - Payroll batches & payslips lock permanently in `firestore.rules` once `status == 'Paid'`.
5. **Server Timestamps**:
   - `createdAt`, `updatedAt`, `clockInAt`, `clockOutAt`, `reviewedAt`, and `paidAt` use `serverTimestamp()` validated against `request.time` in `firestore.rules`.

## 4. Technical Risks & Mitigations

| Risk | Mitigation |
| :--- | :--- |
| **Starter-tier Firebase project IAM limits for `firebase-admin`** | All database & auth flows execute through the authenticated client SDK backed by hardened `firestore.rules` rather than IAM-dependent Admin SDK scripts. |
| **Email/Password Auth disabled by default after provisioning** | `AuthGate` supports both Google Sign-In (`signInWithPopup`) and Email/Password, surfacing clear Firebase Console instructions when `auth/operation-not-allowed` occurs. |
| **Concurrent Clock-In or Leave Approval races** | Deterministic `{employeeId}_{workDate}` IDs + Firestore `runTransaction` precondition checks (`status == 'Pending'`). |
| **PII & Salary exposure on list queries** | Non-backoffice queries strictly filter by `uid == request.auth.uid`; `firestore.rules` denies unfiltered `list` queries on `employees`, `payslips`, `attendance`, and `notifications`. |
