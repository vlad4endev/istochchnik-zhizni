package expo.modules.callscreen

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person

/** Данные входящего звонка, которые передаются в приложение по нажатию. */
data class IncomingCall(
  val callId: String,
  val callerName: String,
  val callType: String,
  val conversationId: String,
  val callerId: String,
  val callerAvatar: String
)

/**
 * Полноэкранное уведомление о входящем звонке.
 *
 * Если телефон заблокирован или экран выключен, система сама открывает приложение поверх экрана
 * блокировки (full-screen intent); если телефон в руках — показывается всплывающее уведомление с
 * кнопками «Принять» и «Отклонить». Звонок и вибрация повторяются, пока уведомление не снято.
 */
object CallNotifications {
  /**
   * Канал создаётся один раз и потом не меняется (звук канала после создания не поменять),
   * поэтому при смене мелодии у канала новое имя, а старый удаляется.
   */
  const val CHANNEL_ID = "incoming_calls_v2"
  private const val OLD_CHANNEL_ID = "incoming_calls_fullscreen"
  /** Файл мелодии: res/raw/call_ringtone.wav (его кладёт плагин expo-notifications из assets/sounds). */
  private const val RINGTONE_RES = "call_ringtone"
  private const val TAG = "incoming_call"
  private const val SCHEME = "istochnik"
  private const val HOST = "incoming-call"

  private fun notificationId(callId: String): Int = callId.hashCode()

  /** Своя мелодия звонка; если файла нет в сборке — системный рингтон. */
  private fun ringtoneUri(context: Context): Uri {
    val res = context.resources.getIdentifier(RINGTONE_RES, "raw", context.packageName)
    return if (res != 0) {
      Uri.parse("android.resource://${context.packageName}/$res")
    } else {
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
    }
  }

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.deleteNotificationChannel(OLD_CHANNEL_ID)
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Входящие звонки", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Полноэкранный экран входящего аудио- и видеозвонка"
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 900, 700, 900, 700)
      setBypassDnd(false)
      val ringtone: Uri = ringtoneUri(context)
      val attrs = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      setSound(ringtone, attrs)
    }
    manager.createNotificationChannel(channel)
  }

  /**
   * Ссылка, которую получает приложение. Формат разбирает JavaScript (lib/callLink.ts) — менять
   * имена полей нужно в обоих местах.
   */
  private fun linkFor(call: IncomingCall, action: String): Uri =
    Uri.Builder()
      .scheme(SCHEME)
      .authority(HOST)
      .appendQueryParameter("action", action)
      .appendQueryParameter("callId", call.callId)
      .appendQueryParameter("callerName", call.callerName)
      .appendQueryParameter("callType", call.callType)
      .appendQueryParameter("conversationId", call.conversationId)
      .appendQueryParameter("callerId", call.callerId)
      .appendQueryParameter("callerAvatar", call.callerAvatar)
      .build()

  private fun pendingIntent(context: Context, call: IncomingCall, action: String, requestCode: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, linkFor(call, action)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun smallIcon(context: Context): Int {
    val custom = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (custom != 0) custom else context.applicationInfo.icon
  }

  /** Показывает звонок. Возвращает false, если уведомления запрещены пользователем. */
  fun show(context: Context, call: IncomingCall, ttlSec: Int): Boolean {
    val compat = NotificationManagerCompat.from(context)
    if (!compat.areNotificationsEnabled()) return false
    ensureChannel(context)

    val base = notificationId(call.callId)
    val open = pendingIntent(context, call, "open", base)
    val answer = pendingIntent(context, call, "accept", base + 1)
    val decline = pendingIntent(context, call, "decline", base + 2)

    val title = if (call.callType == "video") "Входящий видеозвонок" else "Входящий звонок"
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon(context))
      .setContentTitle(call.callerName)
      .setContentText(title)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(false)
      .setTimeoutAfter(ttlSec.coerceIn(15, 180) * 1000L)
      .setContentIntent(open)
      .setFullScreenIntent(open, true)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val person = Person.Builder().setName(call.callerName).setImportant(true).build()
      builder.setStyle(NotificationCompat.CallStyle.forIncomingCall(person, decline, answer))
    } else {
      builder.addAction(0, "Отклонить", decline)
      builder.addAction(0, "Принять", answer)
    }

    val notification = builder.build()
    // Звонок и вибрация повторяются, пока уведомление не снято или не истёк срок.
    notification.flags = notification.flags or Notification.FLAG_INSISTENT
    return try {
      compat.notify(TAG, base, notification)
      true
    } catch (e: SecurityException) {
      false
    }
  }

  fun dismiss(context: Context, callId: String) {
    NotificationManagerCompat.from(context).cancel(TAG, notificationId(callId))
  }

  /** С Android 14 право на полноэкранные уведомления пользователь может отозвать. */
  fun canUseFullScreenIntent(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < 34) return true
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return manager.canUseFullScreenIntent()
  }
}
