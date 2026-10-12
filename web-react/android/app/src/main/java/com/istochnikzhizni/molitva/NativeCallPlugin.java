package com.istochnikzhizni.molitva;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeCall")
public class NativeCallPlugin extends Plugin {
  private static NativeCallPlugin instance;

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

  @PluginMethod
  public void endCall(PluginCall call) {
    final String callId = call.getString("callId", "");
    final Context ctx = getContext();
    if (ctx != null && callId != null && !callId.isEmpty()) {
      CallNotificationHelper.cancelIncomingCall(ctx, callId);
    }
    call.resolve();
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
    emit("accepted", callId, callerName, callType, conversationId, callerId, callerAvatar, url);
  }

  static void notifyDeclined(String callId) {
    final JSObject data = new JSObject();
    data.put("callId", callId == null ? "" : callId);
    if (instance != null) {
      instance.notifyListeners("declined", data);
    }
  }

  static void notifyEnded(String callId) {
    final JSObject data = new JSObject();
    data.put("callId", callId == null ? "" : callId);
    if (instance != null) {
      instance.notifyListeners("ended", data);
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
