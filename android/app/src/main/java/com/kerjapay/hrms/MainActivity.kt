package com.kerjapay.hrms

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.android.gms.location.LocationServices
import com.kerjapay.hrms.ui.HrmsViewModel
import com.kerjapay.hrms.ui.screens.*
import com.kerjapay.hrms.ui.theme.KerjaPayTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            KerjaPayTheme {
                KerjaPayMobileRoot()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KerjaPayMobileRoot(vm: HrmsViewModel = viewModel()) {
    val state by vm.uiState.collectAsState()
    val context = LocalContext.current
    val fusedLocation = remember { LocationServices.getFusedLocationProviderClient(context) }

    var activeTab by remember { mutableIntStateOf(0) }
    var pendingClockAction by remember { mutableStateOf<String?>(null) }

    @SuppressLint("MissingPermission")
    fun dispatchWithLocation(action: String) {
        val hasFine = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        if (hasFine) {
            fusedLocation.lastLocation
                .addOnSuccessListener { loc ->
                    if (action == "in") vm.clockIn(loc?.latitude, loc?.longitude, loc != null)
                    else vm.clockOut(loc?.latitude, loc?.longitude)
                }
                .addOnFailureListener {
                    if (action == "in") vm.clockIn(null, null, false)
                    else vm.clockOut(null, null)
                }
        } else {
            if (action == "in") vm.clockIn(null, null, false)
            else vm.clockOut(null, null)
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ ->
        pendingClockAction?.let { dispatchWithLocation(it) }
        pendingClockAction = null
    }

    fun triggerClock(action: String) {
        val hasFine = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        if (hasFine) {
            dispatchWithLocation(action)
        } else {
            pendingClockAction = action
            permissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                )
            )
        }
    }

    if (!state.isAuthenticated) {
        LoginScreen(
            busy = state.busy,
            errorMessage = state.errorMessage,
            onSignIn = vm::signIn,
        )
        return
    }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = { Text("KerjaPay ESS") },
                )
                SyncStatusBanner(
                    hasPendingWrites = state.hasPendingWrites,
                    isFromCache = state.isFromCache,
                )
            }
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = activeTab == 0,
                    onClick = { activeTab = 0 },
                    icon = { Icon(Icons.Default.Home, contentDescription = "Beranda") },
                    label = { Text("Beranda") },
                )
                NavigationBarItem(
                    selected = activeTab == 1,
                    onClick = { activeTab = 1 },
                    icon = { Icon(Icons.Default.Schedule, contentDescription = "Presensi") },
                    label = { Text("Presensi") },
                )
                NavigationBarItem(
                    selected = activeTab == 2,
                    onClick = { activeTab = 2 },
                    icon = { Icon(Icons.Default.CalendarMonth, contentDescription = "Cuti") },
                    label = { Text("Cuti & Lembur") },
                )
                NavigationBarItem(
                    selected = activeTab == 3,
                    onClick = { activeTab = 3 },
                    icon = { Icon(Icons.Default.Person, contentDescription = "Profil") },
                    label = { Text("Gaji & Profil") },
                )
            }
        },
    ) { padding ->
        Column(modifier = Modifier.padding(padding)) {
            val feedback = state.errorMessage ?: state.statusMessage
            if (feedback != null) {
                Surface(
                    color = if (state.errorMessage != null) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer,
                ) {
                    TextButton(onClick = vm::clearNotices) {
                        Text(feedback)
                    }
                }
            }

            when (activeTab) {
                0 -> HomeDashboardScreen(
                    state = state,
                    onClockIn = { triggerClock("in") },
                    onClockOut = { triggerClock("out") },
                    onMarkNotificationRead = vm::markNotificationRead,
                )
                1 -> AttendanceHistoryScreen(state = state)
                2 -> LeaveAndOvertimeScreen(
                    state = state,
                    onSubmitLeave = vm::submitLeave,
                    onSubmitOvertime = vm::submitOvertime,
                )
                3 -> PayslipsAndProfileScreen(
                    state = state,
                    onChangePassword = vm::changePassword,
                    onSignOut = vm::signOut,
                )
            }
        }
    }
}
