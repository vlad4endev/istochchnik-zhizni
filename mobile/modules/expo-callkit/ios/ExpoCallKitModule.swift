import ExpoModulesCore

public class ExpoCallKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoCallKit")

    Events("onVoipToken", "onIncomingCall", "onAnswerCall", "onEndCall", "onAudioSession")

    OnCreate {
      CallKitCenter.shared.start()
    }

    // Как только JavaScript начинает слушать, ему отдаются накопленные события.
    OnStartObserving {
      CallKitCenter.shared.setSender { [weak self] name, body in
        self?.sendEvent(name, body)
      }
    }

    OnStopObserving {
      CallKitCenter.shared.setSender(nil)
    }

    Function("getVoipToken") { () -> String? in
      return CallKitCenter.shared.voipToken
    }

    Function("isCallActive") { (callId: String) -> Bool in
      return CallKitCenter.shared.isCallActive(callId)
    }

    Function("reportCallEnded") { (callId: String, reason: String) in
      CallKitCenter.shared.reportEnded(callId: callId, reason: reason)
    }

    AsyncFunction("requestEndCall") { (callId: String, promise: Promise) in
      CallKitCenter.shared.requestEnd(callId: callId) { ok in
        promise.resolve(ok)
      }
    }
  }
}
