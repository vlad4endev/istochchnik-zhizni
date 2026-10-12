package com.istochnikzhizni.molitva;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;

/** Полноэкранный входящий на locked screen (full-screen intent). */
public class IncomingCallActivity extends Activity {
  private String callId = "";
  private String callerName = "";
  private String callType = "audio";
  private String conversationId = "";
  private String callerId = "";
  private String callerAvatar = "";
  private String url = "";

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    setShowWhenLockedAndTurnScreenOn();
    setContentView(buildContentView());
    readExtras(getIntent());
    bindUi();
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    readExtras(intent);
    bindUi();
  }

  private void setShowWhenLockedAndTurnScreenOn() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true);
      setTurnScreenOn(true);
    } else {
      getWindow().addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
          | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
          | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
      );
    }
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      final KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
      if (km != null) {
        km.requestDismissKeyguard(this, null);
      }
    }
  }

  private View buildContentView() {
    // Программный layout — без отдельного XML, чтобы не править ресурсы.
    final android.widget.LinearLayout root = new android.widget.LinearLayout(this);
    root.setOrientation(android.widget.LinearLayout.VERTICAL);
    root.setGravity(android.view.Gravity.CENTER_HORIZONTAL);
    root.setBackgroundColor(0xFF12121C);
    final int pad = (int) (24 * getResources().getDisplayMetrics().density);
    root.setPadding(pad, pad * 3, pad, pad * 2);

    final TextView label = new TextView(this);
    label.setId(View.generateViewId());
    label.setTag("label");
    label.setTextColor(0x99FFFFFF);
    label.setTextSize(14);
    label.setGravity(android.view.Gravity.CENTER);
    root.addView(label);

    final TextView name = new TextView(this);
    name.setId(View.generateViewId());
    name.setTag("name");
    name.setTextColor(0xFFFFFFFF);
    name.setTextSize(28);
    name.setPadding(0, pad, 0, pad / 2);
    name.setGravity(android.view.Gravity.CENTER);
    root.addView(name);

    final TextView hint = new TextView(this);
    hint.setId(View.generateViewId());
    hint.setTag("hint");
    hint.setTextColor(0xB3FFFFFF);
    hint.setTextSize(16);
    hint.setGravity(android.view.Gravity.CENTER);
    root.addView(hint);

    final android.widget.LinearLayout actions = new android.widget.LinearLayout(this);
    actions.setOrientation(android.widget.LinearLayout.HORIZONTAL);
    actions.setGravity(android.view.Gravity.CENTER);
    final android.widget.LinearLayout.LayoutParams actionsLp =
      new android.widget.LinearLayout.LayoutParams(
        android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
        android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
      );
    actionsLp.topMargin = pad * 4;
    actions.setLayoutParams(actionsLp);

    final Button decline = new Button(this);
    decline.setTag("decline");
    decline.setText("Отклонить");
    decline.setBackgroundColor(0xFFEF4444);
    decline.setTextColor(0xFFFFFFFF);
    final android.widget.LinearLayout.LayoutParams btnLp =
      new android.widget.LinearLayout.LayoutParams(0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
    btnLp.setMarginEnd(pad / 2);
    decline.setLayoutParams(btnLp);
    actions.addView(decline);

    final Button accept = new Button(this);
    accept.setTag("accept");
    accept.setText("Принять");
    accept.setBackgroundColor(0xFF22C55E);
    accept.setTextColor(0xFFFFFFFF);
    final android.widget.LinearLayout.LayoutParams acceptLp =
      new android.widget.LinearLayout.LayoutParams(0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
    acceptLp.setMarginStart(pad / 2);
    accept.setLayoutParams(acceptLp);
    actions.addView(accept);

    root.addView(actions);
    return root;
  }

  private void readExtras(Intent intent) {
    if (intent == null) return;
    callId = trim(intent.getStringExtra(CallNotificationHelper.EXTRA_CALL_ID));
    callerName = trim(intent.getStringExtra(CallNotificationHelper.EXTRA_CALLER_NAME));
    callType = trim(intent.getStringExtra(CallNotificationHelper.EXTRA_CALL_TYPE));
    conversationId = trim(intent.getStringExtra(CallNotificationHelper.EXTRA_CONVERSATION_ID));
    callerId = trim(intent.getStringExtra(CallNotificationHelper.EXTRA_CALLER_ID));
    callerAvatar = trim(intent.getStringExtra(CallNotificationHelper.EXTRA_CALLER_AVATAR));
    url = trim(intent.getStringExtra(CallNotificationHelper.EXTRA_PUSH_URL));
    if (url.isEmpty() && !callId.isEmpty()) {
      url = "/call/" + callId;
    }
  }

  private void bindUi() {
    final View root = findViewById(android.R.id.content);
    final TextView label = root.findViewWithTag("label");
    final TextView name = root.findViewWithTag("name");
    final TextView hint = root.findViewWithTag("hint");
    final Button decline = root.findViewWithTag("decline");
    final Button accept = root.findViewWithTag("accept");

    if (label != null) {
      label.setText("video".equalsIgnoreCase(callType) ? "Входящий видеозвонок" : "Входящий звонок");
    }
    if (name != null) {
      name.setText(callerName.isEmpty() ? "Собеседник" : callerName);
    }
    if (hint != null) {
      hint.setText("video".equalsIgnoreCase(callType) ? "Видеозвонок" : "Аудиозвонок");
    }
    if (decline != null) {
      decline.setOnClickListener(v -> onDecline());
    }
    if (accept != null) {
      accept.setOnClickListener(v -> onAccept());
    }
  }

  private void onAccept() {
    CallNotificationHelper.cancelIncomingCall(this, callId);
    NativeCallPlugin.notifyAccepted(callId, callerName, callType, conversationId, callerId, callerAvatar, url);
    final Intent launch = new Intent(this, MainActivity.class);
    launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    launch.putExtra("push_url", url);
    launch.putExtra("push_conversation_id", conversationId);
    startActivity(launch);
    finish();
  }

  private void onDecline() {
    CallNotificationHelper.cancelIncomingCall(this, callId);
    NativeCallPlugin.notifyDeclined(callId);
    final Intent launch = new Intent(this, MainActivity.class);
    launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    launch.putExtra("push_url", "/call/" + callId + "?decline=1");
    launch.putExtra("push_conversation_id", conversationId);
    startActivity(launch);
    finish();
  }

  private static String trim(String v) {
    return v == null ? "" : v.trim();
  }
}
