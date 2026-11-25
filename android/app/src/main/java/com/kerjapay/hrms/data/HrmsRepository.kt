package com.kerjapay.hrms.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.MetadataChanges
import com.google.firebase.firestore.Query
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.UUID

data class SyncSnapshot<T>(
    val items: List<T>,
    val hasPendingWrites: Boolean,
    val isFromCache: Boolean,
)

class HrmsRepository {
    private val auth = FirestoreClient.auth
    private val db = FirestoreClient.db

    suspend fun signIn(email: String, password: String): Result<Unit> = runCatching {
        val res = auth.signInWithEmailAndPassword(email.trim(), password).await()
        val user = res.user ?: error("Autentikasi gagal")
        if (!user.isEmailVerified) {
            user.sendEmailVerification().await()
            error("Email belum terverifikasi. Silakan klik tautan verifikasi di email Anda.")
        }
        claimEmployeeUidIfUnbound(user.uid, user.email.orEmpty())
    }

    suspend fun changePassword(newPassword: String): Result<Unit> = runCatching {
        val user = auth.currentUser ?: error("Sesi tidak ditemukan")
        user.updatePassword(newPassword).await()
    }

    fun signOut() {
        auth.signOut()
    }

    private suspend fun claimEmployeeUidIfUnbound(uid: String, email: String) {
        val cleanEmail = email.lowercase().trim()
        val userDocRef = db.collection("users").document(uid)
        val userSnap = userDocRef.get().await()

        val empSnap = db.collection("employees")
            .whereEqualTo("email", cleanEmail)
            .limit(1)
            .get()
            .await()

        val matchedEmpDoc = empSnap.documents.firstOrNull()
        if (matchedEmpDoc != null && matchedEmpDoc.getString("uid").isNullOrEmpty()) {
            matchedEmpDoc.reference.update(
                mapOf(
                    "uid" to uid,
                    "updatedAt" to FieldValue.serverTimestamp(),
                )
            ).await()
        }

        if (!userSnap.exists()) {
            userDocRef.set(
                mapOf(
                    "uid" to uid,
                    "companyId" to (matchedEmpDoc?.getString("companyId") ?: "comp_nusantara_01"),
                    "employeeId" to (matchedEmpDoc?.id ?: ""),
                    "email" to cleanEmail,
                    "displayName" to (matchedEmpDoc?.getString("fullName") ?: cleanEmail.substringBefore("@")),
                    "role" to "Employee",
                    "status" to "active",
                    "departmentId" to (matchedEmpDoc?.getString("departmentId") ?: ""),
                    "recordStatus" to "active",
                    "createdBy" to uid,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp(),
                )
            ).await()
        }
    }

    fun observeEmployeeProfile(uid: String): Flow<EmployeeProfile?> = callbackFlow {
        val reg = db.collection("employees")
            .whereEqualTo("uid", uid)
            .limit(1)
            .addSnapshotListener(MetadataChanges.INCLUDE) { snap, err ->
                if (err != null) {
                    close(err)
                    return@addSnapshotListener
                }
                val doc = snap?.documents?.firstOrNull()
                trySend(doc?.toObject(EmployeeProfile::class.java))
            }
        awaitClose { reg.remove() }
    }

    fun observeAttendance(uid: String): Flow<SyncSnapshot<AttendanceRecord>> = callbackFlow {
        val reg = db.collection("attendance")
            .whereEqualTo("uid", uid)
            .orderBy("workDate", Query.Direction.DESCENDING)
            .limit(60)
            .addSnapshotListener(MetadataChanges.INCLUDE) { snap, err ->
                if (err != null) {
                    close(err)
                    return@addSnapshotListener
                }
                val items = snap?.documents?.mapNotNull { it.toObject(AttendanceRecord::class.java) }.orEmpty()
                trySend(
                    SyncSnapshot(
                        items = items,
                        hasPendingWrites = snap?.metadata?.hasPendingWrites() ?: false,
                        isFromCache = snap?.metadata?.isFromCache ?: false,
                    )
                )
            }
        awaitClose { reg.remove() }
    }

    fun observeLeaves(uid: String): Flow<List<LeaveRequest>> = callbackFlow {
        val reg = db.collection("leave_requests")
            .whereEqualTo("uid", uid)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(40)
            .addSnapshotListener { snap, err ->
                if (err != null) {
                    close(err)
                    return@addSnapshotListener
                }
                trySend(snap?.documents?.mapNotNull { it.toObject(LeaveRequest::class.java) }.orEmpty())
            }
        awaitClose { reg.remove() }
    }

    fun observeLeaveBalance(uid: String): Flow<LeaveBalance?> = callbackFlow {
        val reg = db.collection("leave_balances")
            .whereEqualTo("uid", uid)
            .limit(1)
            .addSnapshotListener { snap, err ->
                if (err != null) {
                    close(err)
                    return@addSnapshotListener
                }
                trySend(snap?.documents?.firstOrNull()?.toObject(LeaveBalance::class.java))
            }
        awaitClose { reg.remove() }
    }

    fun observeOvertime(uid: String): Flow<List<OvertimeRequest>> = callbackFlow {
        val reg = db.collection("overtime_requests")
            .whereEqualTo("uid", uid)
            .orderBy("overtimeDate", Query.Direction.DESCENDING)
            .limit(40)
            .addSnapshotListener { snap, err ->
                if (err != null) {
                    close(err)
                    return@addSnapshotListener
                }
                trySend(snap?.documents?.mapNotNull { it.toObject(OvertimeRequest::class.java) }.orEmpty())
            }
        awaitClose { reg.remove() }
    }

    fun observeShifts(): Flow<List<ShiftSchedule>> = callbackFlow {
        val reg = db.collection("shifts")
            .whereEqualTo("recordStatus", "active")
            .addSnapshotListener { snap, err ->
                if (err != null) {
                    close(err)
                    return@addSnapshotListener
                }
                trySend(snap?.documents?.mapNotNull { it.toObject(ShiftSchedule::class.java) }.orEmpty())
            }
        awaitClose { reg.remove() }
    }

    fun observePayslips(uid: String): Flow<List<PayslipItem>> = callbackFlow {
        val reg = db.collection("payslips")
            .whereEqualTo("uid", uid)
            .orderBy("periodMonth", Query.Direction.DESCENDING)
            .limit(24)
            .addSnapshotListener { snap, err ->
                if (err != null) {
                    close(err)
                    return@addSnapshotListener
                }
                trySend(snap?.documents?.mapNotNull { it.toObject(PayslipItem::class.java) }.orEmpty())
            }
        awaitClose { reg.remove() }
    }

    fun observeAnnouncements(): Flow<List<AnnouncementItem>> = callbackFlow {
        val reg = db.collection("announcements")
            .whereEqualTo("recordStatus", "active")
            .addSnapshotListener { snap, err ->
                if (err != null) {
                    close(err)
                    return@addSnapshotListener
                }
                trySend(snap?.documents?.mapNotNull { it.toObject(AnnouncementItem::class.java) }.orEmpty())
            }
        awaitClose { reg.remove() }
    }

    fun observeNotifications(uid: String): Flow<List<NotificationItem>> = callbackFlow {
        val reg = db.collection("notifications")
            .whereEqualTo("recipientUid", uid)
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(40)
            .addSnapshotListener { snap, err ->
                if (err != null) {
                    close(err)
                    return@addSnapshotListener
                }
                trySend(snap?.documents?.mapNotNull { it.toObject(NotificationItem::class.java) }.orEmpty())
            }
        awaitClose { reg.remove() }
    }

    /**
     * Atomic Clock-In using deterministic composite key {employeeId}_{workDate}
     * to prevent duplicate attendance submissions across multiple devices.
     */
    suspend fun clockIn(
        employee: EmployeeProfile,
        lat: Double?,
        lng: Double?,
        gpsVerified: Boolean,
    ): Result<Unit> = runCatching {
        val uid = auth.currentUser?.uid ?: error("Autentikasi diperlukan")
        val workDate = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE)
        val attendanceId = "${employee.employeeId}_$workDate"
        val docRef = db.collection("attendance").document(attendanceId)

        db.runTransaction { tx ->
            val snap = tx.get(docRef)
            if (snap.exists()) {
                throw IllegalStateException("Presensi masuk untuk tanggal $workDate sudah tercatat.")
            }
            val payload = hashMapOf<String, Any>(
                "attendanceId" to attendanceId,
                "companyId" to employee.companyId,
                "employeeId" to employee.employeeId,
                "uid" to uid,
                "workDate" to workDate,
                "shiftId" to employee.shiftId,
                "clockInAt" to FieldValue.serverTimestamp(),
                "gpsVerified" to gpsVerified,
                "lateMinutes" to 0,
                "workMinutes" to 0,
                "status" to "Present",
                "correctionStatus" to "None",
                "sourceDevice" to "Android Kotlin Compose",
                "recordStatus" to "active",
                "createdBy" to uid,
                "createdAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp(),
            )
            if (lat != null) payload["clockInLat"] = lat
            if (lng != null) payload["clockInLng"] = lng
            tx.set(docRef, payload)
        }.await()
    }

    suspend fun clockOut(
        employee: EmployeeProfile,
        lat: Double?,
        lng: Double?,
    ): Result<Unit> = runCatching {
        val workDate = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE)
        val attendanceId = "${employee.employeeId}_$workDate"
        val docRef = db.collection("attendance").document(attendanceId)

        db.runTransaction { tx ->
            val snap = tx.get(docRef)
            if (!snap.exists()) {
                throw IllegalStateException("Belum ada catatan Clock-In hari ini.")
            }
            if (snap.getTimestamp("clockOutAt") != null) {
                throw IllegalStateException("Clock-Out hari ini sudah tercatat.")
            }
            val inTimeMs = snap.getTimestamp("clockInAt")?.toDate()?.time ?: System.currentTimeMillis()
            val workMinutes = ((System.currentTimeMillis() - inTimeMs) / 60000L).coerceAtLeast(0L)
            val updates = hashMapOf<String, Any>(
                "clockOutAt" to FieldValue.serverTimestamp(),
                "workMinutes" to workMinutes,
                "updatedAt" to FieldValue.serverTimestamp(),
            )
            if (lat != null) updates["clockOutLat"] = lat
            if (lng != null) updates["clockOutLng"] = lng
            tx.update(docRef, updates)
        }.await()
    }

    suspend fun submitLeave(
        employee: EmployeeProfile,
        leaveType: String,
        startDate: String,
        endDate: String,
        totalDays: Int,
        reason: String,
    ): Result<Unit> = runCatching {
        val uid = auth.currentUser?.uid ?: error("Autentikasi diperlukan")
        val leaveId = "lv_${UUID.randomUUID().toString().take(12)}"
        db.collection("leave_requests").document(leaveId).set(
            mapOf(
                "leaveRequestId" to leaveId,
                "companyId" to employee.companyId,
                "employeeId" to employee.employeeId,
                "uid" to uid,
                "supervisorId" to employee.supervisorId,
                "leaveType" to leaveType,
                "startDate" to startDate,
                "endDate" to endDate,
                "totalDays" to totalDays.coerceAtLeast(1),
                "reason" to reason.trim().take(500),
                "status" to "Pending",
                "recordStatus" to "active",
                "createdBy" to uid,
                "createdAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp(),
            )
        ).await()
    }

    suspend fun submitOvertime(
        employee: EmployeeProfile,
        overtimeDate: String,
        startTime: String,
        endTime: String,
        durationHours: Double,
        reason: String,
    ): Result<Unit> = runCatching {
        val uid = auth.currentUser?.uid ?: error("Autentikasi diperlukan")
        val overtimeId = "ot_${UUID.randomUUID().toString().take(12)}"
        db.collection("overtime_requests").document(overtimeId).set(
            mapOf(
                "overtimeId" to overtimeId,
                "companyId" to employee.companyId,
                "employeeId" to employee.employeeId,
                "uid" to uid,
                "supervisorId" to employee.supervisorId,
                "overtimeDate" to overtimeDate,
                "startTime" to startTime,
                "endTime" to endTime,
                "durationHours" to durationHours.coerceAtLeast(0.5),
                "reason" to reason.trim().take(400),
                "status" to "Pending",
                "recordStatus" to "active",
                "createdBy" to uid,
                "createdAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp(),
            )
        ).await()
    }

    suspend fun markNotificationRead(notificationId: String) {
        db.collection("notifications").document(notificationId).update(
            mapOf(
                "isRead" to true,
                "updatedAt" to FieldValue.serverTimestamp(),
            )
        ).await()
    }
}
