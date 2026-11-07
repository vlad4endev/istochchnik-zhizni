package com.istochnikzhizni.molitva;

import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor bridge for CallStyle / incoming call UI + in-app ringtone
 * (Web Audio is often muted by autoplay policy until a user gesture).
 */
@CapacitorPlugin(name = "NativeCall")
public class NativeCallPlugin extends Plugin {
  private static NativeCallPlugin instance;
  private Ringtone activeRingtone;
  private Vibrator vibrator;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private Runnable loopFallback;

  @Override
  public void load() {
    instance = this;
    final Context ctx = getContext();
    if (ctx != null) {
      CallNotificationHelper.ensureCallChannel(ctx);
    }
  }

  @Override
  protected void handleOnDestroy() {
    stopRingtoneInternal();
    if (instance == this) {
      instance = null;
    }
    super.handleOnDestroy();
  }

  @PluginMethod
  public void isSupported(PluginCall call) {
    final JSObject ret = new JSObject();
    ret.put("supported", true);
    call.resolve(ret);
  }

  /** Системный экран «Уведомления» приложения: после отказа в разрешении повторный запрос недоступен. */
  @PluginMethod
  public void openNotificationSettings(PluginCall call) {
    final Context ctx = getContext();
    if (ctx == null) {
      call.reject("no context");
      return;
    }
    try {
      final Intent intent = new Intent();
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        intent.setAction(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
      } else {
        intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + ctx.getPackageName()));
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      ctx.startActivity(intent);
      call.resolve();
    } catch (Exception e) {
      call.reject("openNotificationSettings failed: " + e.getMessage());
    }
  }

  @PluginMethod
  public void endCall(PluginCall call) {
    final String callId = call.getString("callId", "");
    final Context ctx = getContext();
    stopRingtoneInternal();
    if (ctx != null) {
      OngoingCallService.stop(ctx);
      if (callId != null && !callId.isEmpty()) {
        CallNotificationHelper.cancelIncomingCall(ctx, callId);
      }
    }
    call.resolve();
  }

  /**
   * Keep LiveKit/WebRTC alive when the screen locks or the app is backgrounded.
   * Starts a microphone(+camera) foreground service with an ongoing CallStyle notification.
   */
  @PluginMethod
  public void startOngoing(PluginCall call) {
    final Context ctx = getContext();
    if (ctx == null) {
      call.reject("no context");
      return;
    }
    final String callId = call.getString("callId", "");
    if (callId == null || callId.trim().isEmpty()) {
      call.reject("callId required");
      return;
    }
    final String peerName = call.getString("peerName", "Собеседник");
    final String callType = call.getString("callType", "audio");
    final String callKind = call.getString("callKind", "direct");
    final Boolean hasVideoOpt = call.getBoolean("hasVideo");
    final boolean hasVideo =
      hasVideoOpt != null
        ? hasVideoOpt.booleanValue()
        : "video".equalsIgnoreCase(callType == null ? "audio" : callType);

    stopRingtoneInternal();
    CallNotificationHelper.cancelIncomingCall(ctx, callId.trim());
    OngoingCallService.start(
      ctx,
      callId.trim(),
      peerName == null ? "Собеседник" : peerName,
      callType == null ? "audio" : callType,
      callKind == null ? "direct" : callKind,
      hasVideo
    );
    call.resolve();
  }

  @PluginMethod
  public void stopOngoing(PluginCall call) {
    final Context ctx = getContext();
    if (ctx != null) {
      OngoingCallService.stop(ctx);
    }
    call.resolve();
  }

  @PluginMethod
  public void playRingtone(PluginCall call) {
    getBridge().executeOnMainThread(() -> {
      try {
        startRingtoneInternal();
        call.resolve();
      } catch (Exception e) {
        call.reject("playRingtone failed: " + e.getMessage());
      }
    });
  }

  @PluginMethod
  public void stopRingtone(PluginCall call) {
    getBridge().executeOnMainThread(() -> {
      stopRingtoneInternal();
      call.resolve();
    });
  }

  private void startRingtoneInternal() {
    final Context ctx = getContext();
    if (ctx == null) return;

    stopRingtoneInternal();

    final Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
    final Ringtone ringtone = RingtoneManager.getRingtone(ctx, uri);
    if (ringtone == null) return;

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      ringtone.setLooping(true);
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      ringtone.setAudioAttributes(
        new AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      );
    }
    activeRingtone = ringtone;
    ringtone.play();

    // Fallback loop for API < 28 (setLooping unavailable)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
      loopFallback = new Runnable() {
        @Override
        public void run() {
          if (activeRingtone != ringtone) return;
          try {
            if (!ringtone.isPlaying()) {
              ringtone.play();
            }
          } catch (Exception ignored) {
            return;
          }
          mainHandler.postDelayed(this, 1500);
        }
      };
      mainHandler.postDelayed(loopFallback, 1500);
    }

    startVibration(ctx);
  }

  private void stopRingtoneInternal() {
    if (loopFallback != null) {
      mainHandler.removeCallbacks(loopFallback);
      loopFallback = null;
    }
    if (activeRingtone != null) {
      try {
        if (activeRingtone.isPlaying()) {
          activeRingtone.stop();
        }
      } catch (Exception ignored) {
        /* already stopped */
      }
      activeRingtone = null;
    }
    stopVibration();
  }

  private void startVibration(Context ctx) {
    stopVibration();
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        final VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
        vibrator = vm != null ? vm.getDefaultVibrator() : null;
      } else {
        vibrator = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
      }
      if (vibrator == null || !vibrator.hasVibrator()) return;
      final long[] pattern = new long[] { 0, 300, 120, 300, 120, 600, 800 };
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
      } else {
        vibrator.vibrate(pattern, 0);
      }
    } catch (Exception ignored) {
      /* no vibrator permission / emulator */
    }
  }

  private void stopVibration() {
    if (vibrator != null) {
      try {
        vibrator.cancel();
      } catch (Exception ignored) {
        /* ignore */
      }
      vibrator = null;
    }
  }

  static void stopRingtoneIfPlaying() {
    final NativeCallPlugin plugin = instance;
    if (plugin == null) return;
    plugin.mainHandler.post(plugin::stopRingtoneInternal);
  }

  static void notifyIncoming(
    String callId,
    String callerName,
    String callType,
    String conversationId,
    String callerId,
    String callerAvatar,
    String url
  ) {
    emit("incoming", callId, callerName, callType, conversationId, callerId, callerAvatar, url);
  }

  static void notifyAccepted(
    String callId,
    String callerName,
    String callType,
    String conversationId,
    String callerId,
    String callerAvatar,
    String url
  ) {
    stopRingtoneIfPlaying();
    emit("accepted", callId, callerName, callType, conversationId, callerId, callerAvatar, url);
  }

  static void notifyDeclined(String callId) {
    stopRingtoneIfPlaying();
    final JSObject data = new JSObject();
    data.put("callId", callId == null ? "" : callId);
    if (instance != null) {
      instance.notifyListeners("declined", data);
    }
  }

  static void notifyEnded(String callId) {
    stopRingtoneIfPlaying();
    final JSObject data = new JSObject();
    data.put("callId", callId == null ? "" : callId);
    if (instance != null) {
      instance.notifyListeners("ended", data);
    }
  }

  /** User tapped «Завершить» on the ongoing-call notification (lock screen / shade). */
  static void notifyHangupRequested(String callId) {
    stopRingtoneIfPlaying();
    final Context ctx = instance != null ? instance.getContext() : null;
    if (ctx != null) {
      OngoingCallService.stop(ctx);
    }
    final JSObject data = new JSObject();
    data.put("callId", callId == null ? "" : callId);
    if (instance != null) {
      instance.notifyListeners("hangupRequested", data);
    }
  }

  private static void emit(
    String event,
    String callId,
    String callerName,
    String callType,
    String conversationId,
    String callerId,
    String callerAvatar,
    String url
  ) {
    if (instance == null) return;
    final JSObject data = new JSObject();
    data.put("callId", callId == null ? "" : callId);
    data.put("callerName", callerName == null ? "" : callerName);
    data.put("callType", callType == null ? "audio" : callType);
    data.put("conversationId", conversationId == null ? "" : conversationId);
    data.put("callerId", callerId == null ? "" : callerId);
    data.put("callerAvatar", callerAvatar == null ? "" : callerAvatar);
    data.put("url", url == null ? "" : url);
    instance.notifyListeners(event, data);
  }
}
