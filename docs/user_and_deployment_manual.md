# KerjaPay HRMS — Installation, Deployment & User Manual

## 1. Web Application Installation & Deployment
1. Install Node.js dependencies:
   ```bash
   npm install
   ```
2. Start development / production-compatible Express server on port `3000`:
   ```bash
   npm run dev
   ```
3. Build static PWA bundle:
   ```bash
   npm run build
   ```
4. Deploy Firestore rules & composite indexes (when using Firebase CLI):
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

## 2. Native Android Build Setup (`/android/`)
1. Open Firebase Console for project `gen-lang-client-0038887098` → Project Settings → Add Android App (`com.kerjapay.hrms`).
2. Download `google-services.json` and place it at `android/app/google-services.json`.
3. Open `/android/` in Android Studio (Koala / Ladybug or newer, JDK 17) and sync Gradle.
4. `FirestoreClient.kt` connects automatically to the shared database `ai-studio-kerjapayhrm-d470c31c-7780-4443-a128-dc2da419f959`.

## 3. Backoffice Admin Manual
1. **First Login (Super Admin)**: Sign in as `caycayaisha62@gmail.com` via Google Sign-In. The app automatically initializes the company profile, Indonesian PPh 21/BPJS settings, departments, positions, shifts, and sample records.
2. **Adding Employees & Binding Accounts**: Open **Karyawan → Tambah Karyawan** and enter the employee's verified company email. When that employee signs in via Web ESS or Android, their Firebase UID automatically links to their employee record.
3. **Role Assignment**: Open **Pengaturan → Manajemen Akun & Peran RBAC** to assign `HR Admin`, `Management`, `Supervisor`, or `Employee`, or deactivate accounts.
4. **Monthly Payroll Workflow**:
   - Open **Payroll**, select `YYYY-MM`, and click **Generate Payroll Bulan Ini**.
   - Review itemized earnings, BPJS, and PPh 21.
   - Advance workflow step-by-step: `Calculation → HR Review → Management Approval → Finalized → Paid`.
   - Once marked `Paid`, records lock permanently.

## 4. Employee Mobile / ESS Manual
1. Sign in via **Mobile ESS** (Web/PWA or Android app) using your verified company email.
2. **Clock-In / Clock-Out**: Tap **Clock In** (captures GPS + selfie in Web ESS, GPS in Android). Duplicate clock-ins on the same date are automatically prevented.
3. **Leave & Overtime**: Submit requests in **Cuti & Lembur**; monitor approval status and live remaining leave quota.
4. **Payslips**: Open **Laporan / Gaji & Profil** to inspect itemized deductions and print/save PDF payslips.

## 5. Backup & Recovery
- Enable scheduled Cloud Firestore exports in Google Cloud Console targeting a dedicated GCS backup bucket for point-in-time recovery.
- `audit_logs` records all sensitive employee, leave, overtime, payroll, and settings changes and cannot be updated or deleted by clients.
