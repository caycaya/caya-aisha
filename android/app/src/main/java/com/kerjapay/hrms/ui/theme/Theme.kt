package com.kerjapay.hrms.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val KerjaPayLightColors = lightColorScheme(
    primary = Color(0xFF047857),
    onPrimary = Color.White,
    secondary = Color(0xFF0F172A),
    onSecondary = Color.White,
    background = Color(0xFFF4F6F9),
    surface = Color.White,
    onSurface = Color(0xFF0F172A),
    outline = Color(0xFFE2E8F0),
)

@Composable
fun KerjaPayTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = KerjaPayLightColors,
        content = content,
    )
}
