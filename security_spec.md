# Security Specification & Payload-First TDD (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Baseline**: Every unspecified Firestore path is denied (`allow read, write: if false;`).
2. **Verified Identity**: All reads/writes require `request.auth != null` and `request.auth.token.email_verified == true` (plus active user record check or bootstrapped Super Admin `caycayaisha62@gmail.com`).
3. **No Self-Privilege Escalation**: Users cannot create or update their own `users/{uid}` document to change `role` or `status`; only `Super Admin` can assign or change RBAC roles.
4. **Duplicate Attendance Prevention**: `attendance/{attendanceId}` enforces deterministic document ID `{employeeId}_{workDate}` on create and forbids client overwrites (`allow create` checks `!exists(...)`, and employees cannot alter `status` or another employee's `employeeId`).
5. **Salary & Payslip Isolation**: `payslips/{payslipId}` and `payroll/{payrollId}` are strictly restricted. Employees can only `get` or `list` payslips where `resource.data.uid == request.auth.uid` (or `resource.data.employeeId == currentUser().employeeId`). Finalized/Paid payroll runs and payslips cannot be modified even by HR Admin without Super Admin override or never after `Paid`.
6. **Immutable Audit Logs**: `audit_logs/{logId}` allows `create` by authenticated users for their own `actorUid == request.auth.uid` and `read` only by `Super Admin` / `HR Admin` / `Management`; `update` and `delete` are strictly `false`.
7. **Temporal & Structural Integrity**: Writes validate `createdAt == request.time` on create, `updatedAt == request.time` on update, `createdBy == request.auth.uid`, strict key allowlists (`hasAll` / `hasOnly` / `affectedKeys().hasOnly`), and explicit string `.size()` limits.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Privilege Escalation (Self-Role Upgrade)**: Employee sends `UPDATE /users/{ownUid}` with `{ role: "Super Admin" }` -> MUST return `PERMISSION_DENIED`.
2. **Shadow Field Injection**: HR Admin sends `CREATE /employees/EMP-999` with an extra ghost field `{ isRootAdmin: true }` -> MUST return `PERMISSION_DENIED`.
3. **Unverified Email Spoof**: Caller with `email == "caycayaisha62@gmail.com"` and `email_verified == false` reads `/payroll/PAY-1` -> MUST return `PERMISSION_DENIED`.
4. **Cross-Employee Payslip Read**: Employee A requests `GET /payslips/PAY-EMP-B` where `uid != request.auth.uid` -> MUST return `PERMISSION_DENIED`.
5. **Blanket List Scraping**: Employee requests `LIST /payslips` without `where("uid", "==", request.auth.uid)` -> MUST return `PERMISSION_DENIED`.
6. **Duplicate / Spoofed Attendance ID**: Employee A sends `CREATE /attendance/EMP-B_2026-11-24` with `employeeId: "EMP-B"` -> MUST return `PERMISSION_DENIED`.
7. **Self-Approving Leave Request**: Employee A sends `UPDATE /leave_requests/LV-1` with `{ status: "Approved" }` -> MUST return `PERMISSION_DENIED`.
8. **Mutating Finalized Payroll**: HR Admin sends `UPDATE /payroll/PAY-2026-10` when existing `status == "Paid"` -> MUST return `PERMISSION_DENIED`.
9. **Audit Log Tampering**: Super Admin or Employee sends `DELETE /audit_logs/LOG-1` or `UPDATE /audit_logs/LOG-1` -> MUST return `PERMISSION_DENIED`.
10. **Path ID Poisoning**: Attacker sends `CREATE /departments/<2000-char-id>` -> MUST return `PERMISSION_DENIED`.
11. **Timestamp Forgery**: Client sends `CREATE /leave_requests/LV-99` with client-forged `createdAt: "2020-01-01T00:00:00Z"` instead of `serverTimestamp()` -> MUST return `PERMISSION_DENIED`.
12. **Supervisor Cross-Department Leave Approval**: Supervisor attempts to approve `leave_requests/LV-OTHER` outside their `employeeId` supervision or status already terminal -> MUST return `PERMISSION_DENIED`.
