package com.kerjapay.hrms.data

import com.google.firebase.Timestamp

data class EmployeeProfile(
    val employeeId: String = "",
    val companyId: String = "comp_nusantara_01",
    val uid: String = "",
    val employeeCode: String = "",
    val fullName: String = "",
    val email: String = "",
    val phone: String = "",
    val departmentId: String = "",
    val positionId: String = "",
    val employmentType: String = "Full-Time",
    val joinDate: String = "",
    val employmentStatus: String = "Active",
    val supervisorId: String = "",
    val shiftId: String = "shift_reg",
    val bankName: String = "",
    val bankAccountNumber: String = "",
    val baseSalary: Long = 0L,
)

data class AttendanceRecord(
    val attendanceId: String = "",
    val companyId: String = "",
    val employeeId: String = "",
    val uid: String = "",
    val workDate: String = "",
    val shiftId: String = "",
    val clockInAt: Timestamp? = null,
    val clockOutAt: Timestamp? = null,
    val clockInLat: Double? = null,
    val clockInLng: Double? = null,
    val gpsVerified: Boolean = false,
    val lateMinutes: Long = 0L,
    val workMinutes: Long = 0L,
    val status: String = "Present",
    val correctionStatus: String = "None",
    val sourceDevice: String = "Android Kotlin App",
)

data class LeaveRequest(
    val leaveRequestId: String = "",
    val employeeId: String = "",
    val leaveType: String = "Annual",
    val startDate: String = "",
    val endDate: String = "",
    val totalDays: Int = 1,
    val reason: String = "",
    val status: String = "Pending",
    val rejectionReason: String = "",
)

data class LeaveBalance(
    val balanceId: String = "",
    val employeeId: String = "",
    val year: Int = 2026,
    val annualQuota: Int = 12,
    val annualUsed: Int = 0,
    val annualRemaining: Int = 12,
)

data class OvertimeRequest(
    val overtimeId: String = "",
    val employeeId: String = "",
    val overtimeDate: String = "",
    val startTime: String = "",
    val endTime: String = "",
    val durationHours: Double = 1.0,
    val reason: String = "",
    val status: String = "Pending",
)

data class ShiftSchedule(
    val shiftId: String = "",
    val name: String = "",
    val startTime: String = "08:30",
    val endTime: String = "17:30",
    val breakMinutes: Int = 60,
    val lateToleranceMinutes: Int = 15,
    val workDaysLabel: String = "Senin - Jumat",
)

data class PayslipItem(
    val payslipId: String = "",
    val periodMonth: String = "",
    val periodLabel: String = "",
    val workflowStatus: String = "Calculation",
    val isProvisional: Boolean = true,
    val basicSalary: Long = 0L,
    val positionAllowance: Long = 0L,
    val transportAllowance: Long = 0L,
    val mealAllowance: Long = 0L,
    val overtimePayment: Long = 0L,
    val grossIncome: Long = 0L,
    val bpjsHealth: Long = 0L,
    val bpjsEmployment: Long = 0L,
    val pph21: Long = 0L,
    val totalDeductions: Long = 0L,
    val netPay: Long = 0L,
)

data class AnnouncementItem(
    val announcementId: String = "",
    val title: String = "",
    val body: String = "",
    val category: String = "Policy",
)

data class NotificationItem(
    val notificationId: String = "",
    val title: String = "",
    val message: String = "",
    val type: String = "Announcement",
    val isRead: Boolean = false,
)
