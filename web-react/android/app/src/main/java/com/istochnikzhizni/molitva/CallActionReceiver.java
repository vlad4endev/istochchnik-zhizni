package com.istochnikzhizni.molitva;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

/** Accept / Decline из CallStyle notification. */
public class CallActionReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (context == null || intent == null || intent.getAction() == null) return;

    final String callId = trim(intent.getStringExtra(CallNotificationHelper.EXTRA_CALL_ID));
    if (callId.isEmpty()) return;

    final String callerName = trim(intent.getStringExtra(CallNotificationHelper.EXTRA_CALLER_NAME));
    final String callType = trim(intent.getStringExtra(CallNotificationHelper.EXTRA_CALL_TYPE));
    final String conversationId = trim(intent.getStringExtra(CallNotificationHelper.EXTRA_CONVERSATION_ID));
    final String callerId = trim(intent.getStringExtra(CallNotificationHelper.EXTRA_CALLER_ID));
    final String callerAvatar = trim(intent.getStringExtra(CallNotificationHelper.EXTRA_CALLER_AVATAR));
    final String url = trim(intent.getStringExtra(CallNotificationHelper.EXTRA_PUSH_URL));

    CallNotificationHelper.cancelIncomingCall(context, callId);

    if (CallNotificationHelper.ACTION_ACCEPT.equals(intent.getAction())) {
      NativeCallPlugin.notifyAccepted(callId, callerName, callType, conversationId, callerId, callerAvatar, url);
      final Intent launch = new Intent(context, MainActivity.class);
      launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      launch.putExtra("push_url", url.isEmpty() ? "/call/" + callId : url);
      launch.putExtra("push_conversation_id", conversationId);
      launch.putExtra(CallNotificationHelper.EXTRA_CALL_ID, callId);
      context.startActivity(launch);
      return;
    }

    if (CallNotificationHelper.ACTION_DECLINE.equals(intent.getAction())) {
      NativeCallPlugin.notifyDeclined(callId);
      // При убитом приложении JS-слушатель может отсутствовать — открываем deep link decline
      final Intent launch = new Intent(context, MainActivity.class);
      launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      final String declineUrl = "/call/" + callId + "?decline=1";
      launch.putExtra("push_url", declineUrl);
      launch.putExtra("push_conversation_id", conversationId);
      context.startActivity(launch);
    }
  }

  private static String trim(String v) {
    return v == null ? "" : v.trim();
  }
}
