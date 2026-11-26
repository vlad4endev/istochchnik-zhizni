package com.istochnikzhizni.molitva

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "church/system")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "notificationsEnabled" -> {
                        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                        result.success(manager.areNotificationsEnabled())
                    }
                    "notificationChannels" -> result.success(NotificationChannels.describe(this))
                    "openChannelSettings" -> {
                        val id = call.argument<String>("id") ?: NotificationChannels.MESSAGES
                        val intent = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                            .putExtra(Settings.EXTRA_CHANNEL_ID, id)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        startActivity(intent)
                        result.success(null)
                    }
                    "openNotificationSettings" -> {
                        val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        startActivity(intent)
                        result.success(null)
                    }
                    "shareText" -> {
                        // Системное окно «Поделиться»: стих можно отправить в любой мессенджер.
                        val text = call.argument<String>("text") ?: ""
                        val title = call.argument<String>("title") ?: ""
                        val send = Intent(Intent.ACTION_SEND)
                            .setType("text/plain")
                            .putExtra(Intent.EXTRA_TEXT, text)
                        if (title.isNotEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title)
                        startActivity(Intent.createChooser(send, title.ifEmpty { null }))
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
