package com.kerjapay.hrms.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.kerjapay.hrms.data.PayslipItem
import com.kerjapay.hrms.ui.HrmsUiState
import java.text.NumberFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private fun formatIdr(amount: Long): String {
    val nf = NumberFormat.getNumberInstance(Locale("in", "ID"))
    return "Rp ${nf.format(amount)}"
}

@Composable
fun LoginScreen(
    busy: Boolean,
    errorMessage: String?,
    onSignIn: (String, String) -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF4F6F9))
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "KerjaPay Employee Mobile",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF0F172A),
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "Terhubung langsung ke database Cloud Firestore perusahaan.",
            style = MaterialTheme.typography.bodySmall,
            color = Color(0xFF64748B),
        )
        Spacer(Modifier.height(20.dp))

        if (errorMessage != null) {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF1F2)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = errorMessage,
                    color = Color(0xFF9F1239),
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(12.dp),
                )
            }
            Spacer(Modifier.height(12.dp))
        }

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email Perusahaan") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Kata Sandi") },
            visualTransformation = PasswordVisualTransformation(),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = { onSignIn(email, password) },
            enabled = !busy && email.isNotBlank() && password.length >= 6,
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            shape = RoundedCornerShape(12.dp),
        ) {
            Text(if (busy) "Memproses..." else "Masuk ke Aplikasi")
        }
    }
}

@Composable
fun SyncStatusBanner(hasPendingWrites: Boolean, isFromCache: Boolean) {
    if (!hasPendingWrites && !isFromCache) return
    val text = if (hasPendingWrites) {
        "Mode Offline: Perubahan tersimpan lokal dan akan otomatis tersinkron ke server."
    } else {
        "Menampilkan data cache lokal saat koneksi terputus."
    }
    Surface(
        color = Color(0xFFFEF3C7),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = text,
            color = Color(0xFF92400E),
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
    }
}

@Composable
fun HomeDashboardScreen(
    state: HrmsUiState,
    onClockIn: () -> Unit,
    onClockOut: () -> Unit,
    onMarkNotificationRead: (String) -> Unit,
) {
    val today = remember { LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE) }
    val todayAtt = state.attendance.firstOrNull { it.workDate == today }
    val unreadCount = state.notifications.count { !it.isRead }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFF0F172A)),
                shape = RoundedCornerShape(20.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = "Halo, ${state.profile?.fullName ?: state.userEmail}",
                        color = Color.White,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Tanggal: $today · ${if (todayAtt == null) "Belum Presensi" else if (todayAtt.clockOutAt == null) "Sudah Clock-In" else "Selesai Kerja"}",
                        color = Color(0xFF94A3B8),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(Modifier.height(16.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Button(
                            onClick = onClockIn,
                            enabled = !state.busy && todayAtt == null && state.profile != null,
                            modifier = Modifier.weight(1f).height(46.dp),
                            shape = RoundedCornerShape(12.dp),
                        ) {
                            Text("Clock In (GPS)")
                        }
                        OutlinedButton(
                            onClick = onClockOut,
                            enabled = !state.busy && todayAtt != null && todayAtt.clockOutAt == null,
                            modifier = Modifier.weight(1f).height(46.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                        ) {
                            Text("Clock Out")
                        }
                    }
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Card(modifier = Modifier.weight(1f), shape = RoundedCornerShape(16.dp)) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text("Sisa Cuti", style = MaterialTheme.typography.labelSmall, color = Color(0xFF64748B))
                        Text(
                            "${state.leaveBalance?.annualRemaining ?: 12} hari",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
                Card(modifier = Modifier.weight(1f), shape = RoundedCornerShape(16.dp)) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text("Notifikasi Baru", style = MaterialTheme.typography.labelSmall, color = Color(0xFF64748B))
                        Text(
                            "$unreadCount",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }

        item {
            Text("Pengumuman Perusahaan", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        }
        items(state.announcements.take(3)) { ann ->
            Card(shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(ann.category, style = MaterialTheme.typography.labelSmall, color = Color(0xFF047857))
                    Text(ann.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(4.dp))
                    Text(ann.body, style = MaterialTheme.typography.bodySmall, color = Color(0xFF475569))
                }
            }
        }

        if (state.notifications.isNotEmpty()) {
            item {
                Text("Notifikasi Terbaru", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            }
            items(state.notifications.take(5)) { notif ->
                Card(
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { if (!notif.isRead) onMarkNotificationRead(notif.notificationId) },
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(notif.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                        Text(notif.message, style = MaterialTheme.typography.bodySmall, color = Color(0xFF475569))
                    }
                }
            }
        }
    }
}

@Composable
fun AttendanceHistoryScreen(state: HrmsUiState) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text("Riwayat Presensi & Jadwal Shift", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
        items(state.shifts) { shift ->
            Card(shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(shift.name, fontWeight = FontWeight.SemiBold)
                    Text(
                        "${shift.startTime} - ${shift.endTime} · Istirahat ${shift.breakMinutes} menit · ${shift.workDaysLabel}",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF64748B),
                    )
                }
            }
        }
        items(state.attendance) { att ->
            Card(shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(att.workDate, fontWeight = FontWeight.SemiBold)
                        Text(
                            "${att.status} · ${if (att.gpsVerified) "GPS Valid" else "Luar Radius"} · ${att.sourceDevice}",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF64748B),
                        )
                    }
                    Text(
                        "${att.workMinutes / 60}j ${att.workMinutes % 60}m",
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF047857),
                    )
                }
            }
        }
    }
}

@Composable
fun LeaveAndOvertimeScreen(
    state: HrmsUiState,
    onSubmitLeave: (String, String, String, Int, String) -> Unit,
    onSubmitOvertime: (String, String, String, Double, String) -> Unit,
) {
    var leaveReason by remember { mutableStateOf("") }
    var leaveDays by remember { mutableStateOf("1") }
    var otHours by remember { mutableStateOf("2.0") }
    var otReason by remember { mutableStateOf("") }
    val today = remember { LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Card(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Ajukan Cuti Tahunan (Sisa: ${state.leaveBalance?.annualRemaining ?: 12} hari)", fontWeight = FontWeight.SemiBold)
                    OutlinedTextField(
                        value = leaveDays,
                        onValueChange = { leaveDays = it },
                        label = { Text("Durasi (Hari)") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = leaveReason,
                        onValueChange = { leaveReason = it },
                        label = { Text("Alasan Cuti") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Button(
                        onClick = {
                            onSubmitLeave("Annual", today, today, leaveDays.toIntOrNull() ?: 1, leaveReason)
                            leaveReason = ""
                        },
                        enabled = leaveReason.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Kirim Pengajuan Cuti")
                    }
                }
            }
        }

        item {
            Card(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Ajukan Lembur (Overtime)", fontWeight = FontWeight.SemiBold)
                    OutlinedTextField(
                        value = otHours,
                        onValueChange = { otHours = it },
                        label = { Text("Durasi (Jam)") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = otReason,
                        onValueChange = { otReason = it },
                        label = { Text("Keterangan Lembur") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Button(
                        onClick = {
                            onSubmitOvertime(today, "18:00", "20:00", otHours.toDoubleOrNull() ?: 1.0, otReason)
                            otReason = ""
                        },
                        enabled = otReason.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Kirim Pengajuan Lembur")
                    }
                }
            }
        }

        items(state.leaves) { lv ->
            Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("${lv.leaveType} · ${lv.totalDays} hari · ${lv.status}", fontWeight = FontWeight.SemiBold)
                    Text("${lv.startDate} s.d. ${lv.endDate} — ${lv.reason}", style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        items(state.overtime) { ot ->
            Card(shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text("Lembur ${ot.overtimeDate} · ${ot.durationHours} jam · ${ot.status}", fontWeight = FontWeight.SemiBold)
                    Text(ot.reason, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
fun PayslipsAndProfileScreen(
    state: HrmsUiState,
    onChangePassword: (String) -> Unit,
    onSignOut: () -> Unit,
) {
    var selectedSlip by remember { mutableStateOf<PayslipItem?>(null) }
    var newPassword by remember { mutableStateOf("") }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Card(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Profil Karyawan", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text("Nama: ${state.profile?.fullName ?: "-"}")
                    Text("Kode: ${state.profile?.employeeCode ?: "-"}")
                    Text("Email: ${state.profile?.email ?: state.userEmail}")
                    Text("Rekening: ${state.profile?.bankName ?: "-"} ${state.profile?.bankAccountNumber ?: ""}")
                    Text("Gaji Pokok: ${formatIdr(state.profile?.baseSalary ?: 0L)}", fontWeight = FontWeight.SemiBold)
                }
            }
        }

        item {
            Text("Slip Gaji Bulanan", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        }
        items(state.payslips) { slip ->
            Card(
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth().clickable { selectedSlip = slip },
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(slip.periodLabel.ifBlank { slip.periodMonth }, fontWeight = FontWeight.SemiBold)
                        Text("${slip.workflowStatus}${if (slip.isProvisional) " · Provisional" else ""}", style = MaterialTheme.typography.bodySmall)
                    }
                    Text(formatIdr(slip.netPay), fontWeight = FontWeight.Bold, color = Color(0xFF047857))
                }
            }
        }

        if (selectedSlip != null) {
            val slip = selectedSlip!!
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Rincian ${slip.periodLabel}", fontWeight = FontWeight.Bold)
                        Text("Penghasilan Bruto: ${formatIdr(slip.grossIncome)}", style = MaterialTheme.typography.bodySmall)
                        Text("BPJS Kesehatan: ${formatIdr(slip.bpjsHealth)}", style = MaterialTheme.typography.bodySmall)
                        Text("BPJS Ketenagakerjaan: ${formatIdr(slip.bpjsEmployment)}", style = MaterialTheme.typography.bodySmall)
                        Text("PPh 21: ${formatIdr(slip.pph21)}", style = MaterialTheme.typography.bodySmall)
                        Text("Total Potongan: ${formatIdr(slip.totalDeductions)}", style = MaterialTheme.typography.bodySmall)
                        Text("Gaji Bersih: ${formatIdr(slip.netPay)}", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        item {
            Card(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Keamanan Akun & Kata Sandi", fontWeight = FontWeight.SemiBold)
                    OutlinedTextField(
                        value = newPassword,
                        onValueChange = { newPassword = it },
                        label = { Text("Kata Sandi Baru (min. 6 karakter)") },
                        visualTransformation = PasswordVisualTransformation(),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Button(
                        onClick = {
                            onChangePassword(newPassword)
                            newPassword = ""
                        },
                        enabled = newPassword.length >= 6,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Ubah Kata Sandi")
                    }
                    OutlinedButton(
                        onClick = onSignOut,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Keluar (Logout)")
                    }
                }
            }
        }
    }
}
