package com.istochnikzhizni.molitva;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Полноэкранный входящий на locked screen (full-screen intent), стиль как в макете. */
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

  private int dp(int value) {
    return (int) TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP,
      value,
      getResources().getDisplayMetrics()
    );
  }

  private GradientDrawable circle(int color) {
    final GradientDrawable d = new GradientDrawable();
    d.setShape(GradientDrawable.OVAL);
    d.setColor(color);
    return d;
  }

  private View buildContentView() {
    final LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setGravity(Gravity.CENTER_HORIZONTAL);
    root.setBackgroundColor(Color.parseColor("#0A0C14"));
    root.setPadding(dp(28), dp(72), dp(28), dp(40));

    final TextView label = new TextView(this);
    label.setTag("label");
    label.setTextColor(Color.parseColor("#C8FFFFFF"));
    label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
    label.setGravity(Gravity.CENTER);
    root.addView(label);

    final TextView avatar = new TextView(this);
    avatar.setTag("avatar");
    avatar.setGravity(Gravity.CENTER);
    avatar.setTextColor(Color.WHITE);
    avatar.setTextSize(TypedValue.COMPLEX_UNIT_SP, 42);
    avatar.setTypeface(Typeface.DEFAULT_BOLD);
    final LinearLayout.LayoutParams avatarLp = new LinearLayout.LayoutParams(dp(160), dp(160));
    avatarLp.topMargin = dp(36);
    avatarLp.bottomMargin = dp(20);
    avatarLp.gravity = Gravity.CENTER_HORIZONTAL;
    avatar.setLayoutParams(avatarLp);
    avatar.setBackground(circle(Color.parseColor("#3B82F6")));
    root.addView(avatar);

    final TextView name = new TextView(this);
    name.setTag("name");
    name.setTextColor(Color.WHITE);
    name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
    name.setTypeface(Typeface.DEFAULT_BOLD);
    name.setGravity(Gravity.CENTER);
    root.addView(name);

    final TextView hint = new TextView(this);
    hint.setTag("hint");
    hint.setTextColor(Color.parseColor("#C8FFFFFF"));
    hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
    hint.setGravity(Gravity.CENTER);
    final LinearLayout.LayoutParams hintLp = new LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    );
    hintLp.topMargin = dp(8);
    hint.setLayoutParams(hintLp);
    root.addView(hint);

    final View spacer = new View(this);
    final LinearLayout.LayoutParams spacerLp = new LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      0,
      1f
    );
    spacer.setLayoutParams(spacerLp);
    root.addView(spacer);

    final LinearLayout actions = new LinearLayout(this);
    actions.setOrientation(LinearLayout.HORIZONTAL);
    actions.setGravity(Gravity.CENTER);
    final LinearLayout.LayoutParams actionsLp = new LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    );
    actions.setLayoutParams(actionsLp);

    final LinearLayout declineCol = actionColumn("decline", "Отклонить", Color.parseColor("#FF3B30"));
    final LinearLayout acceptCol = actionColumn("accept", "Ответить", Color.parseColor("#4CD964"));
    final LinearLayout.LayoutParams colLp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
    declineCol.setLayoutParams(colLp);
    acceptCol.setLayoutParams(colLp);
    actions.addView(declineCol);
    actions.addView(acceptCol);
    root.addView(actions);

    return root;
  }

  private LinearLayout actionColumn(String tag, String label, int color) {
    final LinearLayout col = new LinearLayout(this);
    col.setOrientation(LinearLayout.VERTICAL);
    col.setGravity(Gravity.CENTER_HORIZONTAL);

    final Button btn = new Button(this);
    btn.setTag(tag);
    btn.setText("");
    btn.setBackground(circle(color));
    final LinearLayout.LayoutParams btnLp = new LinearLayout.LayoutParams(dp(76), dp(76));
    btn.setLayoutParams(btnLp);
    col.addView(btn);

    final TextView text = new TextView(this);
    text.setText(label);
    text.setTextColor(Color.WHITE);
    text.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
    text.setGravity(Gravity.CENTER);
    final LinearLayout.LayoutParams textLp = new LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.WRAP_CONTENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    );
    textLp.topMargin = dp(12);
    text.setLayoutParams(textLp);
    col.addView(text);
    return col;
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
    final TextView avatar = root.findViewWithTag("avatar");
    final TextView name = root.findViewWithTag("name");
    final TextView hint = root.findViewWithTag("hint");
    final Button decline = root.findViewWithTag("decline");
    final Button accept = root.findViewWithTag("accept");

    if (label != null) {
      label.setText("video".equalsIgnoreCase(callType) ? "Входящий видеозвонок" : "Входящий звонок");
    }
    final String displayName = callerName.isEmpty() ? "Собеседник" : callerName;
    if (name != null) {
      name.setText(displayName);
    }
    if (avatar != null) {
      final String initial = displayName.substring(0, 1).toUpperCase();
      avatar.setText(initial);
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
