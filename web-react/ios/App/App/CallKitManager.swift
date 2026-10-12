import AVFoundation
import CallKit
import Foundation
import PushKit
import UIKit

/// PushKit + CallKit для системного входящего звонка на iOS.
final class CallKitManager: NSObject {
    static let shared = CallKitManager()

    private let provider: CXProvider
    private let callController = CXCallController()
    private var pushRegistry: PKPushRegistry?
    private var activeCallUUID: UUID?
    private var activeCallId: String?
    private var pendingPayload: [String: String] = [:]
    private var didAnswer = false

    var onVoipToken: ((String) -> Void)?
    var onIncoming: (([String: String]) -> Void)?
    var onAccepted: (([String: String]) -> Void)?
    var onDeclined: ((String) -> Void)?
    var onEnded: ((String) -> Void)?

    private override init() {
        let config = CXProviderConfiguration(localizedName: "Источник жизни")
        config.supportsVideo = true
        config.maximumCallsPerCallGroup = 1
        config.maximumCallGroups = 1
        config.supportedHandleTypes = [.generic]
        config.includesCallsInRecents = true
        if let icon = UIImage(named: "Splash") {
            config.iconTemplateImageData = icon.pngData()
        }
        provider = CXProvider(configuration: config)
        super.init()
        provider.setDelegate(self, queue: nil)
    }

    func start() {
        if pushRegistry != nil { return }
        let registry = PKPushRegistry(queue: DispatchQueue.main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        pushRegistry = registry
    }

    func reportIncoming(from payload: [String: String]) {
        let callId = payload["callId"] ?? ""
        guard !callId.isEmpty else { return }

        let uuid = UUID()
        activeCallUUID = uuid
        activeCallId = callId
        pendingPayload = payload
        didAnswer = false

        let update = CXCallUpdate()
        let name = (payload["callerName"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        update.remoteHandle = CXHandle(type: .generic, value: name.isEmpty ? "Собеседник" : name)
        update.localizedCallerName = name.isEmpty ? "Собеседник" : name
        update.hasVideo = (payload["callType"] ?? "audio") == "video"
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsHolding = false
        update.supportsDTMF = false

        provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if let error = error {
                print("[callkit] reportNewIncomingCall failed: \(error)")
                self?.activeCallUUID = nil
                self?.activeCallId = nil
                return
            }
            self?.onIncoming?(payload)
        }
    }

    func endCall(callId: String) {
        guard let uuid = activeCallUUID else { return }
        if let active = activeCallId, !active.isEmpty, active != callId { return }
        let end = CXEndCallAction(call: uuid)
        let tx = CXTransaction(action: end)
        callController.request(tx) { [weak self] _ in
            self?.provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
            self?.activeCallUUID = nil
            self?.activeCallId = nil
            self?.pendingPayload = [:]
            self?.onEnded?(callId)
        }
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker])
            try session.setActive(true)
        } catch {
            print("[callkit] audio session failed: \(error)")
        }
    }
}

extension CallKitManager: CXProviderDelegate {
    func providerDidReset(_ provider: CXProvider) {
        activeCallUUID = nil
        activeCallId = nil
        pendingPayload = [:]
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        configureAudioSession()
        didAnswer = true
        let payload = pendingPayload
        let callId = payload["callId"] ?? activeCallId ?? ""
        onAccepted?(payload)
        action.fulfill()
        if let url = payload["url"], !url.isEmpty {
            NotificationCenter.default.post(
                name: Notification.Name("NativeCallOpenUrl"),
                object: nil,
                userInfo: ["url": url, "conversationId": payload["conversationId"] ?? ""]
            )
        } else if !callId.isEmpty {
            NotificationCenter.default.post(
                name: Notification.Name("NativeCallOpenUrl"),
                object: nil,
                userInfo: ["url": "/call/\(callId)", "conversationId": payload["conversationId"] ?? ""]
            )
        }
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let callId = activeCallId ?? pendingPayload["callId"] ?? ""
        if !didAnswer {
            onDeclined?(callId)
        }
        onEnded?(callId)
        activeCallUUID = nil
        activeCallId = nil
        pendingPayload = [:]
        didAnswer = false
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        configureAudioSession()
    }
}

extension CallKitManager: PKPushRegistryDelegate {
    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        onVoipToken?(token)
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        guard type == .voIP else { return }
        onVoipToken?("")
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        guard type == .voIP else {
            completion()
            return
        }
        var dict: [String: String] = [:]
        for (k, v) in payload.dictionaryPayload {
            dict[String(describing: k)] = String(describing: v)
        }
        // Nested data from APNs custom payload
        if let type = dict["type"], type == "call_ended" || type == "call_cancelled" {
            let callId = dict["callId"] ?? ""
            endCall(callId: callId)
            completion()
            return
        }
        reportIncoming(from: dict)
        completion()
    }
}
