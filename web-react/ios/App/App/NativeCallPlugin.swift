import Foundation
import Capacitor

@objc(NativeCallPlugin)
public class NativeCallPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeCallPlugin"
    public let jsName = "NativeCall"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerVoip", returnType: CAPPluginReturnPromise),
    ]

    private var lastVoipToken: String?

    public override func load() {
        let manager = CallKitManager.shared
        manager.onVoipToken = { [weak self] token in
            self?.lastVoipToken = token.isEmpty ? nil : token
            var data: [String: Any] = [:]
            if !token.isEmpty {
                data["token"] = token
            }
            self?.notifyListeners("voipToken", data: data)
        }
        manager.onIncoming = { [weak self] payload in
            self?.notifyListeners("incoming", data: payload)
        }
        manager.onAccepted = { [weak self] payload in
            self?.notifyListeners("accepted", data: payload)
        }
        manager.onDeclined = { [weak self] callId in
            self?.notifyListeners("declined", data: ["callId": callId])
        }
        manager.onEnded = { [weak self] callId in
            self?.notifyListeners("ended", data: ["callId": callId])
        }
        manager.start()
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": true])
    }

    @objc func endCall(_ call: CAPPluginCall) {
        let callId = call.getString("callId") ?? ""
        if !callId.isEmpty {
            CallKitManager.shared.endCall(callId: callId)
        }
        call.resolve()
    }

    @objc func registerVoip(_ call: CAPPluginCall) {
        CallKitManager.shared.start()
        if let token = lastVoipToken {
            call.resolve(["token": token])
        } else {
            call.resolve(["token": NSNull()])
        }
    }
}
