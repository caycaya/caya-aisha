import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Static & structural verification of the Dirty Dozen security controls
 * declared in security_spec.md and enforced in firestore.rules.
 */
describe('Firestore Security Rules — Dirty Dozen Guard Verification', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesText = fs.readFileSync(rulesPath, 'utf8');

  it('1. Enforces default-deny catch-all at top of ruleset', () => {
    expect(rulesText).toContain('match /{document=**}');
    expect(rulesText).toContain('allow read, write: if false;');
  });

  it('2. Blocks email spoofing via email_verified == true requirement', () => {
    expect(rulesText).toContain('request.auth.token.email_verified == true');
  });

  it('3. Prevents self-privilege escalation on /users/{uid}', () => {
    expect(rulesText).toContain("affectedKeys().hasOnly(['displayName', 'updatedAt'])");
    expect(rulesText).toContain('isSuperAdmin()');
  });

  it('4. Isolates /payslips/{payslipId} reads to owner uid or Payroll Admin', () => {
    expect(rulesText).toContain('resource.data.uid == request.auth.uid || isPayrollAdmin()');
  });

  it('5. Enforces deterministic composite key & uid binding on /attendance/{attendanceId}', () => {
    expect(rulesText).toContain("attendanceId == (incoming().employeeId + '_' + incoming().workDate)");
    expect(rulesText).toContain('incoming().uid == request.auth.uid');
  });

  it('6. Locks terminal Paid payroll & payslip records from modification', () => {
    expect(rulesText).toContain("existing().status != 'Paid'");
    expect(rulesText).toContain("existing().workflowStatus != 'Paid'");
  });

  it('7. Enforces immutable /audit_logs (no update, no delete)', () => {
    expect(rulesText).toContain('match /audit_logs/{logId}');
    expect(rulesText).toContain('allow update, delete: if false;');
  });

  it('8. Enforces Path Variable Hardening via isValidId()', () => {
    expect(rulesText).toContain("id.matches('^[a-zA-Z0-9_\\\\-]+$')");
    expect(rulesText).toContain('isValidId(employeeId)');
    expect(rulesText).toContain('isValidId(attendanceId)');
  });

  it('9. Enforces server timestamp integrity (request.time)', () => {
    expect(rulesText).toContain('incoming().createdAt == request.time');
    expect(rulesText).toContain('incoming().updatedAt == request.time');
  });

  it('10. Covers all 17 collections from firebase-blueprint.json', () => {
    const collections = [
      'companies',
      'users',
      'employees',
      'departments',
      'positions',
      'attendance',
      'leave_requests',
      'leave_balances',
      'shifts',
      'overtime_requests',
      'payroll',
      'payslips',
      'performance_reviews',
      'announcements',
      'notifications',
      'audit_logs',
      'system_settings',
    ];
    for (const col of collections) {
      expect(rulesText).toContain(`match /${col}/`);
    }
  });
});
