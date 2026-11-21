package expo.modules.callscreen

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoCallScreenModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoCallScreen")

    // Показать полноэкранный входящий звонок. Работает и когда JavaScript запущен без интерфейса (пуш при закрытом приложении).
    Function("showIncomingCall") {
      callId: String, callerName: String, callType: String, conversationId: String,
      callerId: String, callerAvatar: String, ttlSec: Int ->
      val context = appContext.reactContext ?: return@Function false
      CallNotifications.show(
        context,
        IncomingCall(callId, callerName, callType, conversationId, callerId, callerAvatar),
        ttlSec
      )
    }

    Function("dismissIncomingCall") { callId: String ->
      val context = appContext.reactContext ?: return@Function
      CallNotifications.dismiss(context, callId)
    }

    // Показывать приложение поверх экрана блокировки — только пока звонит входящий.
    // Постоянно включать нельзя: открытые чаты были бы видны на заблокированном телефоне.
    Function("setShowOverLockScreen") { enabled: Boolean ->
      val activity = appContext.currentActivity ?: return@Function
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) return@Function
      activity.runOnUiThread {
        activity.setShowWhenLocked(enabled)
        activity.setTurnScreenOn(enabled)
      }
    }

    Function("canUseFullScreenIntent") { ->
      val context = appContext.reactContext ?: return@Function true
      CallNotifications.canUseFullScreenIntent(context)
    }

    Function("openFullScreenIntentSettings") { ->
      val context = appContext.reactContext ?: return@Function
      if (Build.VERSION.SDK_INT < 34) return@Function
      val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
        data = Uri.parse("package:" + context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }
  }
}
