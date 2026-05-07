package com.istochnikzhizni.molitva;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.NonNull;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
  private static final String EXTRA_PUSH_URL = "push_url";
  private static final String EXTRA_PUSH_CONVERSATION_ID = "push_conversation_id";
  private static final int MAX_DISPATCH_ATTEMPTS = 20;
  private static final long DISPATCH_RETRY_MS = 150L;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    dispatchPushNavigationFromIntent(getIntent(), 0);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    dispatchPushNavigationFromIntent(intent, 0);
  }

  private void dispatchPushNavigationFromIntent(Intent intent, int attempt) {
    if (intent == null || intent.getExtras() == null) return;
    final String url = trimOrEmpty(intent.getStringExtra(EXTRA_PUSH_URL));
    final String conversationId = trimOrEmpty(intent.getStringExtra(EXTRA_PUSH_CONVERSATION_ID));
    if (url.isEmpty() && conversationId.isEmpty()) return;

    if (bridge == null || bridge.getWebView() == null) {
      if (attempt >= MAX_DISPATCH_ATTEMPTS) return;
      new Handler(Looper.getMainLooper()).postDelayed(
        () -> dispatchPushNavigationFromIntent(intent, attempt + 1),
        DISPATCH_RETRY_MS
      );
      return;
    }

    final String payload = toSafeJson(url, conversationId);
    final String script =
      "window.dispatchEvent(new CustomEvent('app:native-push-navigate',{detail:" + payload + "}));";
    bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(script, null));

    intent.removeExtra(EXTRA_PUSH_URL);
    intent.removeExtra(EXTRA_PUSH_CONVERSATION_ID);
  }

  @NonNull
  private static String trimOrEmpty(String value) {
    return value == null ? "" : value.trim();
  }

  @NonNull
  private static String toSafeJson(String url, String conversationId) {
    try {
      JSONObject obj = new JSONObject();
      obj.put("url", url);
      obj.put("conversationId", conversationId);
      return obj.toString();
    } catch (Exception ignored) {
      return "{\"url\":\"\",\"conversationId\":\"\"}";
    }
  }
}
