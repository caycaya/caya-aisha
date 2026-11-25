package com.kerjapay.hrms

import android.app.Application
import com.google.firebase.FirebaseApp

class KerjaPayApp : Application() {
    override fun onCreate() {
        super.onCreate()
        FirebaseApp.initializeApp(this)
    }
}
