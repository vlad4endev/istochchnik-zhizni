package com.istochnikzhizni.molitva;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import java.util.Map;

/** Системный входящий звонок (CallStyle + full-screen intent). */
public final class CallNotificationHelper {
  public static final String CHANNEL_CALLS_ID = "calls";
  private static final String CHANNEL_CALLS_NAME = "Звонки";
  private static final String CHANNEL_CALLS_DESC = "Входящие аудио- и видеозвонки";

  public static final String ACTION_ACCEPT = "com.istochnikzhizni.molitva.CALL_ACCEPT";
  public static final String ACTION_DECLINE = "com.istochnikzhizni.molitva.CALL_DECLINE";
  public static final String EXTRA_CALL_ID = "call_id";
  public static final String EXTRA_CALLER_NAME = "caller_name";
  public static final String EXTRA_CALL_TYPE = "call_type";
  public static final String EXTRA_CONVERSATION_ID = "conversation_id";
  public static final String EXTRA_CALLER_ID = "caller_id";
  public static final String EXTRA_CALLER_AVATAR = "caller_avatar";
  public static final String EXTRA_PUSH_URL = "push_url";

  private CallNotificationHelper() {}

  public static void ensureCallChannel(@NonNull Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    final NotificationManager manager = context.getSystemService(NotificationManager.class);
    if (manager == null) return;

    final NotificationChannel channel = new NotificationChannel(
      CHANNEL_CALLS_ID,
      CHANNEL_CALLS_NAME,
      NotificationManager.IMPORTANCE_HIGH
    );
    channel.setDescription(CHANNEL_CALLS_DESC);
    channel.enableVibration(true);
    channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
    channel.setBypassDnd(true);
    final Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
    final AudioAttributes attrs = new AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build();
    channel.setSound(ringtone, attrs);
    manager.createNotificationChannel(channel);
  }

  public static void showIncomingCall(@NonNull Context context, @NonNull Map<String, String> data) {
    ensureCallChannel(context);

    final String callId = valueOrEmpty(data.get("callId"));
    if (callId.isEmpty()) return;

    final String callerName = valueOrDefault(data.get("callerName"), valueOrDefault(data.get("body"), "Собеседник"));
    final String callType = valueOrDefault(data.get("callType"), "audio");
    final String conversationId = valueOrEmpty(data.get("conversationId"));
    final String callerId = valueOrEmpty(data.get("callerId"));
    final String callerAvatar = valueOrEmpty(data.get("callerAvatar"));
    final String url = valueOrDefault(data.get("url"), "/call/" + callId);
    final String title = "video".equalsIgnoreCase(callType) ? "Входящий видеозвонок" : "Входящий звонок";

    final int notifyId = stableId(callId);
    final int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
      ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
      : PendingIntent.FLAG_UPDATE_CURRENT;

    final Intent fullScreen = new Intent(context, IncomingCallActivity.class);
    putCallExtras(fullScreen, callId, callerName, callType, conversationId, callerId, callerAvatar, url);
    fullScreen.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    final PendingIntent fullScreenPi = PendingIntent.getActivity(context, notifyId, fullScreen, flags);

    final Intent acceptIntent = new Intent(context, CallActionReceiver.class);
    acceptIntent.setAction(ACTION_ACCEPT);
    putCallExtras(acceptIntent, callId, callerName, callType, conversationId, callerId, callerAvatar, url);
    final PendingIntent acceptPi = PendingIntent.getBroadcast(context, notifyId + 1, acceptIntent, flags);

    final Intent declineIntent = new Intent(context, CallActionReceiver.class);
    declineIntent.setAction(ACTION_DECLINE);
    putCallExtras(declineIntent, callId, callerName, callType, conversationId, callerId, callerAvatar, url);
    final PendingIntent declinePi = PendingIntent.getBroadcast(context, notifyId + 2, declineIntent, flags);

    final Person caller = new Person.Builder().setName(callerName).setImportant(true).build();

    final NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_CALLS_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title)
      .setContentText(callerName)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setOngoing(true)
      .setAutoCancel(false)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setTimeoutAfter(60_000L)
      .setFullScreenIntent(fullScreenPi, true)
      .setContentIntent(fullScreenPi)
      .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
      .setDefaults(NotificationCompat.DEFAULT_VIBRATE);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setStyle(
        NotificationCompat.CallStyle.forIncomingCall(caller, declinePi, acceptPi)
      );
    } else {
      builder
        .addAction(0, "Отклонить", declinePi)
        .addAction(0, "Принять", acceptPi);
    }

    NotificationManagerCompat.from(context).notify("call-" + callId, notifyId, builder.build());
    NativeCallPlugin.notifyIncoming(callId, callerName, callType, conversationId, callerId, callerAvatar, url);
  }

  public static void cancelIncomingCall(@NonNull Context context, @NonNull String callId) {
    if (callId.isEmpty()) return;
    NotificationManagerCompat.from(context).cancel("call-" + callId, stableId(callId));
    NativeCallPlugin.notifyEnded(callId);
  }

  static void putCallExtras(
    Intent intent,
    String callId,
    String callerName,
    String callType,
    String conversationId,
    String callerId,
    String callerAvatar,
    String url
  ) {
    intent.putExtra(EXTRA_CALL_ID, callId);
    intent.putExtra(EXTRA_CALLER_NAME, callerName);
    intent.putExtra(EXTRA_CALL_TYPE, callType);
    intent.putExtra(EXTRA_CONVERSATION_ID, conversationId);
    intent.putExtra(EXTRA_CALLER_ID, callerId);
    intent.putExtra(EXTRA_CALLER_AVATAR, callerAvatar);
    intent.putExtra(EXTRA_PUSH_URL, url);
  }

  static int stableId(String callId) {
    return Math.abs(callId.hashCode());
  }

  private static String valueOrDefault(String v, String fallback) {
    return v == null || v.trim().isEmpty() ? fallback : v.trim();
  }

  private static String valueOrEmpty(String v) {
    return v == null ? "" : v.trim();
  }
}
