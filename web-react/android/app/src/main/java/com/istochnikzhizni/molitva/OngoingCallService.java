package com.istochnikzhizni.molitva;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;

/**
 * Foreground service while a LiveKit call is active.
 * Without this, Android freezes/kills the WebView WebRTC stack when the screen
 * locks or the app is backgrounded — personal and group calls both die.
 */
public class OngoingCallService extends Service {
  public static final String ACTION_START = "com.istochnikzhizni.molitva.ONGOING_CALL_START";
  public static final String ACTION_STOP = "com.istochnikzhizni.molitva.ONGOING_CALL_STOP";
  public static final String ACTION_HANGUP = "com.istochnikzhizni.molitva.ONGOING_CALL_HANGUP";

  public static final String EXTRA_CALL_ID = "call_id";
  public static final String EXTRA_PEER_NAME = "peer_name";
  public static final String EXTRA_CALL_TYPE = "call_type";
  public static final String EXTRA_CALL_KIND = "call_kind";
  public static final String EXTRA_HAS_VIDEO = "has_video";

  private static final int NOTIFY_ID = 71001;
  private static final String NOTIFY_TAG = "ongoing-call";

  private static volatile String activeCallId = "";

  public static boolean isRunningFor(String callId) {
    return callId != null && !callId.isEmpty() && callId.equals(activeCallId);
  }

  public static void start(
    Context context,
    String callId,
    String peerName,
    String callType,
    String callKind,
    boolean hasVideo
  ) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    final Intent intent = new Intent(context, OngoingCallService.class);
    intent.setAction(ACTION_START);
    intent.putExtra(EXTRA_CALL_ID, callId.trim());
    intent.putExtra(EXTRA_PEER_NAME, peerName == null ? "" : peerName.trim());
    intent.putExtra(EXTRA_CALL_TYPE, callType == null ? "audio" : callType.trim());
    intent.putExtra(EXTRA_CALL_KIND, callKind == null ? "direct" : callKind.trim());
    intent.putExtra(EXTRA_HAS_VIDEO, hasVideo);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent);
    } else {
      context.startService(intent);
    }
  }

  public static void stop(Context context) {
    if (context == null) return;
    final Intent intent = new Intent(context, OngoingCallService.class);
    intent.setAction(ACTION_STOP);
    try {
      context.startService(intent);
    } catch (Exception ignored) {
      context.stopService(new Intent(context, OngoingCallService.class));
    }
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent == null) {
      stopSelf();
      return START_NOT_STICKY;
    }
    final String action = intent.getAction();
    if (ACTION_STOP.equals(action) || ACTION_HANGUP.equals(action)) {
      if (ACTION_HANGUP.equals(action)) {
        final String callId = trim(intent.getStringExtra(EXTRA_CALL_ID));
        if (!callId.isEmpty()) {
          NativeCallPlugin.notifyHangupRequested(callId);
        }
      }
      activeCallId = "";
      stopForeground(true);
      stopSelf();
      return START_NOT_STICKY;
    }

    final String callId = trim(intent.getStringExtra(EXTRA_CALL_ID));
    if (callId.isEmpty()) {
      stopSelf();
      return START_NOT_STICKY;
    }

    CallNotificationHelper.ensureCallChannel(this);

    final String peerName = valueOrDefault(intent.getStringExtra(EXTRA_PEER_NAME), "Собеседник");
    final String callType = valueOrDefault(intent.getStringExtra(EXTRA_CALL_TYPE), "audio");
    final String callKind = valueOrDefault(intent.getStringExtra(EXTRA_CALL_KIND), "direct");
    final boolean hasVideo =
      intent.getBooleanExtra(EXTRA_HAS_VIDEO, "video".equalsIgnoreCase(callType));

    activeCallId = callId;
    final Notification notification = buildNotification(callId, peerName, callType, callKind, hasVideo);

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
          | ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
        if (hasVideo) {
          type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
        }
        startForeground(NOTIFY_ID, notification, type);
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
          | ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
        if (hasVideo) {
          type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
        }
        startForeground(NOTIFY_ID, notification, type);
      } else {
        startForeground(NOTIFY_ID, notification);
      }
    } catch (Exception e) {
      // Fallback: keep process alive even if typed FGS is rejected on OEM builds.
      try {
        startForeground(NOTIFY_ID, notification);
      } catch (Exception ignored) {
        activeCallId = "";
        stopSelf();
        return START_NOT_STICKY;
      }
    }

    return START_STICKY;
  }

  private Notification buildNotification(
    String callId,
    String peerName,
    String callType,
    String callKind,
    boolean hasVideo
  ) {
    final int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
      ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
      : PendingIntent.FLAG_UPDATE_CURRENT;

    final Intent open = new Intent(this, MainActivity.class);
    open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    open.putExtra("push_url", "/call/" + callId);
    final PendingIntent contentPi = PendingIntent.getActivity(this, NOTIFY_ID, open, flags);

    final Intent hangup = new Intent(this, CallActionReceiver.class);
    hangup.setAction(ACTION_HANGUP);
    hangup.putExtra(EXTRA_CALL_ID, callId);
    hangup.putExtra(CallNotificationHelper.EXTRA_CALL_ID, callId);
    final PendingIntent hangupPi = PendingIntent.getBroadcast(this, NOTIFY_ID + 3, hangup, flags);

    final boolean group = "group".equalsIgnoreCase(callKind);
    final String title = hasVideo
      ? (group ? "Видеовстреча" : "Видеозвонок")
      : (group ? "Аудиовстреча" : "Звонок");
    final String text = peerName.isEmpty() ? "Идёт разговор" : peerName;

    final Person self = new Person.Builder().setName("Вы").setImportant(true).build();
    final Person peer = new Person.Builder().setName(peerName.isEmpty() ? "Собеседник" : peerName).setImportant(true).build();

    final NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CallNotificationHelper.CHANNEL_CALLS_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title)
      .setContentText(text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(contentPi)
      .setUsesChronometer(true)
      .setWhen(System.currentTimeMillis())
      .addAction(0, "Завершить", hangupPi);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setStyle(NotificationCompat.CallStyle.forOngoingCall(peer, hangupPi));
    } else {
      builder.addPerson(self).addPerson(peer);
    }

    return builder.build();
  }

  @Override
  public void onDestroy() {
    activeCallId = "";
    super.onDestroy();
  }

  @Nullable
  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  private static String trim(String v) {
    return v == null ? "" : v.trim();
  }

  private static String valueOrDefault(String v, String fallback) {
    final String t = trim(v);
    return t.isEmpty() ? fallback : t;
  }
}
