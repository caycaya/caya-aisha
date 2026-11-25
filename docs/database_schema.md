# KerjaPay HRMS — Cloud Firestore Database Schema

All 17 collections reside in Firestore database `ai-studio-kerjapayhrm-d470c31c-7780-4443-a128-dc2da419f959` (`firebase-blueprint.json`).

| # | Collection Path | Document ID Strategy | Core Fields & Purpose |
| :--- | :--- | :--- | :--- |
| 1 | `companies/{companyId}` | `comp_nusantara_01` | Master organization info, NPWP, office coordinates (`officeLat`, `officeLng`, `geofenceRadiusMeters`). |
| 2 | `users/{uid}` | Firebase Auth `uid` | RBAC profile (`role`, `status`, `employeeId`, `companyId`, `email`). |
| 3 | `employees/{employeeId}` | `emp_001` / custom ID | 19-field employee master record (NIK, NPWP, department, position, contract dates, supervisor, bank details, base salary & allowances, `uid` binding). |
| 4 | `departments/{departmentId}` | `dept_*` | Department code, name, head employee, description. |
| 5 | `positions/{positionId}` | `pos_*` | Job title, department link, grade, default base salary. |
| 6 | `attendance/{attendanceId}` | **`{employeeId}_{YYYY-MM-DD}`** | Duplicate-proof daily clock-in/out timestamps, GPS coords, `gpsVerified`, optional selfie, `lateMinutes`, `workMinutes`, correction status. |
| 7 | `leave_requests/{leaveRequestId}` | `lv_*` | Leave type (`Annual`, `Sick`, `Personal`, `Maternity`, `Unpaid`), dates, `totalDays`, reason, `status`, `rejectionReason`. |
| 8 | `leave_balances/{balanceId}` | **`{employeeId}_{year}`** | Annual/sick leave quotas, used, and remaining days updated atomically on leave approval. |
| 9 | `shifts/{shiftId}` | `shift_*` | Work schedule (`startTime`, `endTime`, `breakMinutes`, `lateToleranceMinutes`, `isHoliday`). |
| 10 | `overtime_requests/{overtimeId}` | `ot_*` | Overtime date, time window, `durationHours`, reason, approval status. |
| 11 | `payroll/{payrollId}` | `pay_{YYYY_MM}` | Monthly batch header tracking `status` (`Draft` → `Calculation` → `HR Review` → `Management Approval` → `Finalized` → `Paid`), `isProvisional`, totals. |
| 12 | `payslips/{payslipId}` | `{payrollId}_{employeeId}` | Employee-isolated monthly payslip breakdown (basic, allowances, overtime, BPJS Kesehatan, BPJS TK, PPh 21, net pay). |
| 13 | `performance_reviews/{reviewId}` | `perf_*` | Cycle label, KPI & competency scores, rating, strengths, employee acknowledgment status. |
| 14 | `announcements/{announcementId}` | `ann_*` | Company-wide policy, payroll, event, or urgent announcements. |
| 15 | `notifications/{notificationId}` | `notif_*` | Targeted per-user notifications (`recipientUid`, `isRead`, type). |
| 16 | `audit_logs/{logId}` | `log_*` | Immutable audit trail (`allow update, delete: if false;`) capturing actor, action, target collection/ID, and summary. |
| 17 | `system_settings/{settingId}` | `settings_default_2026` | Effective-dated Indonesian PPh 21 (`TER`/`Progressive`), PTKP, BPJS caps/rates, overtime multiplier, and geofence rules. |

## Composite Indexes (`firestore.indexes.json`)
- `employees`: `(companyId ASC, departmentId ASC, employmentStatus ASC)`
- `attendance`: `(uid ASC, workDate DESC)`, `(companyId ASC, workDate DESC)`
- `leave_requests`: `(uid ASC, createdAt DESC)`, `(companyId ASC, status ASC, createdAt DESC)`
- `overtime_requests`: `(uid ASC, overtimeDate DESC)`
- `payslips`: `(uid ASC, periodMonth DESC)`
- `notifications`: `(recipientUid ASC, createdAt DESC)`
- `audit_logs`: `(companyId ASC, createdAt DESC)`
