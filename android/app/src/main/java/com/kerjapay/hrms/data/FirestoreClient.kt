package com.kerjapay.hrms.data

import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.firestoreSettings
import com.google.firebase.firestore.persistentCacheSettings
import com.kerjapay.hrms.BuildConfig

/**
 * Shared Firebase connector binding the native Android client to the exact same
 * Firestore database ID used by the Web Backoffice and ESS Portal.
 */
object FirestoreClient {
    val auth: FirebaseAuth by lazy { FirebaseAuth.getInstance() }

    val db: FirebaseFirestore by lazy {
        val app = FirebaseApp.getInstance()
        FirebaseFirestore.getInstance(app, BuildConfig.FIRESTORE_DATABASE_ID).apply {
            firestoreSettings = firestoreSettings {
                setLocalCacheSettings(persistentCacheSettings {})
            }
        }
    }
}
