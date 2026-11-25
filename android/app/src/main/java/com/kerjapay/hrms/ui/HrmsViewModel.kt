package com.kerjapay.hrms.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import com.kerjapay.hrms.data.*
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class HrmsUiState(
    val isAuthenticated: Boolean = false,
    val userEmail: String = "",
    val profile: EmployeeProfile? = null,
    val attendance: List<AttendanceRecord> = emptyList(),
    val leaves: List<LeaveRequest> = emptyList(),
    val leaveBalance: LeaveBalance? = null,
    val overtime: List<OvertimeRequest> = emptyList(),
    val shifts: List<ShiftSchedule> = emptyList(),
    val payslips: List<PayslipItem> = emptyList(),
    val announcements: List<AnnouncementItem> = emptyList(),
    val notifications: List<NotificationItem> = emptyList(),
    val hasPendingWrites: Boolean = false,
    val isFromCache: Boolean = false,
    val busy: Boolean = false,
    val statusMessage: String? = null,
    val errorMessage: String? = null,
)

class HrmsViewModel(
    private val repo: HrmsRepository = HrmsRepository(),
) : ViewModel() {

    private val _uiState = MutableStateFlow(HrmsUiState())
    val uiState: StateFlow<HrmsUiState> = _uiState.asStateFlow()

    private var listenerJobs: List<Job> = emptyList()

    private val authListener = FirebaseAuth.AuthStateListener { auth ->
        val user = auth.currentUser
        if (user != null && user.isEmailVerified) {
            _uiState.update { it.copy(isAuthenticated = true, userEmail = user.email.orEmpty()) }
            startListeners(user.uid)
        } else {
            stopListeners()
            _uiState.value = HrmsUiState(isAuthenticated = false)
        }
    }

    init {
        FirestoreClient.auth.addAuthStateListener(authListener)
    }

    override fun onCleared() {
        super.onCleared()
        FirestoreClient.auth.removeAuthStateListener(authListener)
        stopListeners()
    }

    private fun stopListeners() {
        listenerJobs.forEach { it.cancel() }
        listenerJobs = emptyList()
    }

    private fun startListeners(uid: String) {
        stopListeners()
        listenerJobs = listOf(
            viewModelScope.launch {
                repo.observeEmployeeProfile(uid).catch { e -> setError(e.message) }.collect { profile ->
                    _uiState.update { it.copy(profile = profile) }
                }
            },
            viewModelScope.launch {
                repo.observeAttendance(uid).catch { e -> setError(e.message) }.collect { snap ->
                    _uiState.update {
                        it.copy(
                            attendance = snap.items,
                            hasPendingWrites = snap.hasPendingWrites,
                            isFromCache = snap.isFromCache,
                        )
                    }
                }
            },
            viewModelScope.launch {
                repo.observeLeaves(uid).catch { e -> setError(e.message) }.collect { items ->
                    _uiState.update { it.copy(leaves = items) }
                }
            },
            viewModelScope.launch {
                repo.observeLeaveBalance(uid).catch { e -> setError(e.message) }.collect { bal ->
                    _uiState.update { it.copy(leaveBalance = bal) }
                }
            },
            viewModelScope.launch {
                repo.observeOvertime(uid).catch { e -> setError(e.message) }.collect { items ->
                    _uiState.update { it.copy(overtime = items) }
                }
            },
            viewModelScope.launch {
                repo.observeShifts().catch { e -> setError(e.message) }.collect { items ->
                    _uiState.update { it.copy(shifts = items) }
                }
            },
            viewModelScope.launch {
                repo.observePayslips(uid).catch { e -> setError(e.message) }.collect { items ->
                    _uiState.update { it.copy(payslips = items) }
                }
            },
            viewModelScope.launch {
                repo.observeAnnouncements().catch { e -> setError(e.message) }.collect { items ->
                    _uiState.update { it.copy(announcements = items) }
                }
            },
            viewModelScope.launch {
                repo.observeNotifications(uid).catch { e -> setError(e.message) }.collect { items ->
                    _uiState.update { it.copy(notifications = items) }
                }
            },
        )
    }

    fun signIn(email: String, password: String) = viewModelScope.launch {
        _uiState.update { it.copy(busy = true, errorMessage = null, statusMessage = null) }
        repo.signIn(email, password)
            .onFailure { setError(it.message) }
        _uiState.update { it.copy(busy = false) }
    }

    fun clockIn(lat: Double?, lng: Double?, gpsVerified: Boolean) = viewModelScope.launch {
        val emp = _uiState.value.profile ?: return@launch setError("Profil karyawan belum tertaut.")
        _uiState.update { it.copy(busy = true, errorMessage = null) }
        repo.clockIn(emp, lat, lng, gpsVerified)
            .onSuccess { _uiState.update { it.copy(statusMessage = "Clock-In berhasil dicatat.") } }
            .onFailure { setError(it.message) }
        _uiState.update { it.copy(busy = false) }
    }

    fun clockOut(lat: Double?, lng: Double?) = viewModelScope.launch {
        val emp = _uiState.value.profile ?: return@launch setError("Profil karyawan belum tertaut.")
        _uiState.update { it.copy(busy = true, errorMessage = null) }
        repo.clockOut(emp, lat, lng)
            .onSuccess { _uiState.update { it.copy(statusMessage = "Clock-Out berhasil dicatat.") } }
            .onFailure { setError(it.message) }
        _uiState.update { it.copy(busy = false) }
    }

    fun submitLeave(type: String, startDate: String, endDate: String, days: Int, reason: String) =
        viewModelScope.launch {
            val emp = _uiState.value.profile ?: return@launch setError("Profil karyawan belum tertaut.")
            repo.submitLeave(emp, type, startDate, endDate, days, reason)
                .onSuccess { _uiState.update { it.copy(statusMessage = "Pengajuan cuti dikirim.") } }
                .onFailure { setError(it.message) }
        }

    fun submitOvertime(date: String, start: String, end: String, hours: Double, reason: String) =
        viewModelScope.launch {
            val emp = _uiState.value.profile ?: return@launch setError("Profil karyawan belum tertaut.")
            repo.submitOvertime(emp, date, start, end, hours, reason)
                .onSuccess { _uiState.update { it.copy(statusMessage = "Pengajuan lembur dikirim.") } }
                .onFailure { setError(it.message) }
        }

    fun changePassword(newPassword: String) = viewModelScope.launch {
        repo.changePassword(newPassword)
            .onSuccess { _uiState.update { it.copy(statusMessage = "Kata sandi berhasil diperbarui.") } }
            .onFailure { setError(it.message) }
    }

    fun markNotificationRead(id: String) = viewModelScope.launch {
        runCatching { repo.markNotificationRead(id) }
    }

    fun signOut() {
        repo.signOut()
    }

    fun clearNotices() {
        _uiState.update { it.copy(errorMessage = null, statusMessage = null) }
    }

    private fun setError(msg: String?) {
        _uiState.update { it.copy(errorMessage = msg ?: "Terjadi kesalahan.") }
    }
}
