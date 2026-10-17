package com.istochnikzhizni.molitva;

import android.app.ActivityManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.List;
import java.util.Map;

/**
 * Единый FCM-сервис: CallStyle для входящих звонков, обычные уведомления для чата,
 * и передача события в Capacitor PushNotifications.
 */
public class AppFirebaseMessagingService extends FirebaseMessagingService {
  private static final String CHANNEL_MESSAGES_ID = "messages";
  private static final String CHANNEL_MESSAGES_NAME = "Сообщения";
  private static final String CHANNEL_MESSAGES_DESC = "Личные и групповые сообщения";
  private static final String CHANNEL_GENERAL_ID = "general";
  private static final String CHANNEL_GENERAL_NAME = "Уведомления";
  private static final String CHANNEL_GENERAL_DESC = "Напоминания и системные уведомления";

  @Override
  public void onNewToken(@NonNull String token) {
    PushNotificationsPlugin.onNewToken(token);
  }

  @Override
  public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
    PushNotificationsPlugin.sendRemoteMessage(remoteMessage);

    final Map<String, String> data = remoteMessage.getData();
    if (data != null && !data.isEmpty()) {
      final String type = valueOrEmpty(data.get("type"));
      if ("incoming_call".equals(type)) {
        // В foreground — WebView overlay; CallStyle нужен в фоне / на lock screen
        if (!isAppInForeground()) {
          CallNotificationHelper.showIncomingCall(this, data);
        }
        return;
      }
      if ("call_ended".equals(type) || "call_cancelled".equals(type)) {
        final String callId = valueOrEmpty(data.get("callId"));
        CallNotificationHelper.cancelIncomingCall(this, callId);
        return;
      }
    }

    // notification payload — Android показывает сам в фоне; дублировать не нужно
    if (remoteMessage.getNotification() != null) {
      return;
    }

    if (data == null || data.isEmpty()) {
      return;
    }

    final String title = valueOrDefault(data.get("title"), "Уведомление");
    final String body = valueOrDefault(data.get("body"), "");
    if (body.isEmpty() && title.equals("Уведомление")) {
      return;
    }

    final String conversationId = valueOrEmpty(data.get("conversationId"));
    final String tag = valueOrEmpty(data.get("tag"));
    final String senderName = valueOrDefault(data.get("senderName"), title);
    final String url = valueOrDefault(data.get("url"), "/");
    final boolean isChat = !conversationId.isEmpty() || tag.startsWith("chat-");

    createChannels();

    if (isAppInForeground()) {
      return;
    }

    final Intent launchIntent = new Intent(this, MainActivity.class);
    launchIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    launchIntent.putExtra("push_url", url);
    launchIntent.putExtra("push_conversation_id", conversationId);

    final int pendingFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
      ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
      : PendingIntent.FLAG_UPDATE_CURRENT;
    final PendingIntent pendingIntent = PendingIntent.getActivity(
      this,
      stableRequestCode(tag, conversationId),
      launchIntent,
      pendingFlags
    );

    final NotificationCompat.Builder builder = new NotificationCompat.Builder(
      this,
      isChat ? CHANNEL_MESSAGES_ID : CHANNEL_GENERAL_ID
    )
      .setSmallIcon(R.drawable.ic_stat_notify)
      .setColor(getColor(R.color.notification_accent))
      .setContentTitle(title)
      .setContentText(body)
      .setPriority(isChat ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_DEFAULT)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setDefaults(NotificationCompat.DEFAULT_SOUND | NotificationCompat.DEFAULT_VIBRATE);

    if (isChat) {
      final Person person = new Person.Builder().setName(senderName).build();
      final NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(person)
        .setConversationTitle(title)
        .addMessage(body, System.currentTimeMillis(), person);
      builder.setStyle(style);
      builder.setCategory(NotificationCompat.CATEGORY_MESSAGE);
    } else {
      builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
      builder.setCategory(NotificationCompat.CATEGORY_REMINDER);
    }

    final String notifyTag = !tag.isEmpty() ? tag : (isChat ? "chat-" + conversationId : "general");
    NotificationManagerCompat.from(this).notify(notifyTag, stableNotificationId(notifyTag), builder.build());
  }

  private void createChannels() {
    createChannels(this);
  }

  /** Каналы должны существовать до первого пуша, даже если приложение ни разу не открывалось после установки. */
  static void createChannels(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    final NotificationManager manager = context.getSystemService(NotificationManager.class);
    if (manager == null) return;

    final NotificationChannel messages = new NotificationChannel(
      CHANNEL_MESSAGES_ID,
      CHANNEL_MESSAGES_NAME,
      NotificationManager.IMPORTANCE_MAX
    );
    messages.setDescription(CHANNEL_MESSAGES_DESC);
    messages.enableVibration(true);
    messages.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
    manager.createNotificationChannel(messages);

    final NotificationChannel general = new NotificationChannel(
      CHANNEL_GENERAL_ID,
      CHANNEL_GENERAL_NAME,
      NotificationManager.IMPORTANCE_HIGH
    );
    general.setDescription(CHANNEL_GENERAL_DESC);
    general.enableVibration(true);
    general.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
    manager.createNotificationChannel(general);

    CallNotificationHelper.ensureCallChannel(context);
  }

  private boolean isAppInForeground() {
    final ActivityManager activityManager = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
    if (activityManager == null) return false;
    final List<ActivityManager.RunningAppProcessInfo> processes = activityManager.getRunningAppProcesses();
    if (processes == null) return false;
    final String packageName = getPackageName();
    for (ActivityManager.RunningAppProcessInfo process : processes) {
      if (packageName.equals(process.processName)
        && process.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) {
        return true;
      }
    }
    return false;
  }

  private static int stableNotificationId(String seed) {
    return Math.abs(seed.hashCode());
  }

  private static int stableRequestCode(String tag, String conversationId) {
    final String seed = !tag.isEmpty() ? tag : conversationId;
    return Math.abs(seed.hashCode());
  }

  private static String valueOrDefault(String v, String fallback) {
    return v == null || v.trim().isEmpty() ? fallback : v.trim();
  }

  private static String valueOrEmpty(String v) {
    return v == null ? "" : v.trim();
  }
}
