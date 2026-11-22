package com.istochnikzhizni.molitva

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build

/**
 * Каналы уведомлений. Звук, важность и показ на экране блокировки система запоминает при первом
 * создании канала и приложению менять не даёт, поэтому каналы создаются сразу и целиком:
 * громкий звук, высокая важность, текст на экране блокировки. Новые каналы с суффиксом `_v2` —
 * на случай, если прежние у кого-то уже создались «тихими»; сервер шлёт устройствам приложения в `_v2`.
 */
object NotificationChannels {
    const val MESSAGES = "messages_v2"
    const val GENERAL = "general_v2"

    // Прежние идентификаторы: сервер ещё может слать в них (пока не обновлён).
    private const val LEGACY_MESSAGES = "messages"
    private const val LEGACY_GENERAL = "general"

    fun ensure(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        create(manager, MESSAGES, "Сообщения", "Новые сообщения в чатах", NotificationManager.IMPORTANCE_HIGH)
        create(manager, GENERAL, "Уведомления церкви", "Лента, молитва, события и напоминания", NotificationManager.IMPORTANCE_HIGH)
        create(manager, LEGACY_MESSAGES, "Сообщения (прежний канал)", "Новые сообщения в чатах", NotificationManager.IMPORTANCE_HIGH)
        create(manager, LEGACY_GENERAL, "Уведомления (прежний канал)", "Лента, молитва, события и напоминания", NotificationManager.IMPORTANCE_HIGH)
    }

    private fun create(manager: NotificationManager, id: String, name: String, description: String, importance: Int) {
        val channel = NotificationChannel(id, name, importance)
        channel.description = description
        channel.enableVibration(true)
        channel.vibrationPattern = longArrayOf(0, 250, 150, 250)
        channel.enableLights(true)
        channel.setShowBadge(true)
        channel.lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        channel.setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(),
        )
        manager.createNotificationChannel(channel)
    }

    /** Для экрана проверки уведомлений: что система реально запомнила про каналы. */
    fun describe(context: Context): List<Map<String, Any?>> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return emptyList()
        val manager = context.getSystemService(NotificationManager::class.java) ?: return emptyList()
        return listOf(MESSAGES, GENERAL).mapNotNull { id ->
            manager.getNotificationChannel(id)?.let {
                mapOf(
                    "id" to it.id,
                    "name" to it.name.toString(),
                    "importance" to it.importance,
                    "hasSound" to (it.sound != null),
                    "lockscreenPublic" to (it.lockscreenVisibility == android.app.Notification.VISIBILITY_PUBLIC),
                )
            }
        }
    }
}
