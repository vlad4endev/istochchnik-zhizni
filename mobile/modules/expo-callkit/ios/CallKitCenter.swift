import AVFoundation
import CallKit
import Foundation
import PushKit

/// Данные звонка, которые нужны, чтобы передать ответ в JavaScript.
struct CallKitCallInfo {
  let callId: String
  let callerName: String
  let video: Bool
  let conversationId: String
  let callerId: String
  let callerAvatar: String
  var answered: Bool
}

/// Один на всё приложение: принимает VoIP-пуши (PushKit) и показывает системный экран звонка (CallKit).
///
/// Главное правило iOS: на КАЖДЫЙ VoIP-пуш надо сразу показать звонок через CallKit, иначе система
/// перестанет доставлять такие пуши приложению. Поэтому здесь даже испорченный пуш превращается
/// в звонок, который тут же завершается.
final class CallKitCenter: NSObject, CXProviderDelegate, PKPushRegistryDelegate {
  static let shared = CallKitCenter()

  /// Сколько секунд звонок звонит, если сервер не сообщил об окончании (звонящий сбросил, а приложение закрыто).
  static let ringTimeoutSeconds: Double = 60

  private var provider: CXProvider?
  private let callController = CXCallController()
  private var registry: PKPushRegistry?
  private var started = false

  private var storedVoipToken: String?
  /// Читается из JavaScript (другой поток), поэтому доступ идёт через главный поток.
  var voipToken: String? {
    return onMainSync { storedVoipToken }
  }
  private var calls: [UUID: CallKitCallInfo] = [:]
  private var ringTimers: [UUID: DispatchWorkItem] = [:]

  /// Куда отправлять события в JavaScript. Пока приложение не слушает, события копятся в `pending`.
  private var sender: ((String, [String: Any]) -> Void)?
  private var pending: [(String, [String: Any])] = []

  // MARK: - Запуск

  /// Вызывается при старте приложения (даже если оно запущено в фоне пушем).
  func start() {
    onMain { [self] in
      guard !started else { return }
      started = true

      let config = CXProviderConfiguration()
      config.supportsVideo = true
      config.maximumCallGroups = 1
      config.maximumCallsPerCallGroup = 1
      config.supportedHandleTypes = [.generic]
      config.includesCallsInRecents = false
      // Своя мелодия: файл лежит в основном бандле (его кладёт плагин expo-notifications).
      // Если файла нет, CallKit играет системный рингтон.
      if Bundle.main.url(forResource: "call_ringtone", withExtension: "wav") != nil {
        config.ringtoneSound = "call_ringtone.wav"
      }
      let provider = CXProvider(configuration: config)
      provider.setDelegate(self, queue: nil)
      self.provider = provider

      let registry = PKPushRegistry(queue: DispatchQueue.main)
      registry.delegate = self
      registry.desiredPushTypes = [.voIP]
      self.registry = registry
    }
  }

  /// Прочитать состояние с главного потока и вернуть результат (состояние меняется только там).
  private func onMainSync<T>(_ work: () -> T) -> T {
    if Thread.isMainThread {
      return work()
    }
    return DispatchQueue.main.sync(execute: work)
  }

  /// Выполнить на главном потоке: сразу, если мы уже там (важно при запуске пушем), иначе — в очередь.
  private func onMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }

  // MARK: - События для JavaScript

  func setSender(_ sender: ((String, [String: Any]) -> Void)?) {
    DispatchQueue.main.async { [self] in
      self.sender = sender
      guard sender != nil else { return }
      // Всё, что произошло, пока JavaScript не слушал, отдаём по порядку.
      let queued = pending
      pending.removeAll()
      for (name, body) in queued { sender?(name, body) }
    }
  }

  private func emit(_ name: String, _ body: [String: Any]) {
    if let sender = sender {
      sender(name, body)
    } else {
      pending.append((name, body))
      if pending.count > 50 { pending.removeFirst() }
    }
  }

  // MARK: - Управление из JavaScript

  func isCallActive(_ callId: String) -> Bool {
    guard let uuid = UUID(uuidString: callId) else { return false }
    return onMainSync { calls[uuid] != nil }
  }

  /// Звонок закончился не по действию пользователя в системном экране (сбросил собеседник, нет ответа).
  func reportEnded(callId: String, reason: String) {
    DispatchQueue.main.async { [self] in
      guard let uuid = UUID(uuidString: callId), calls[uuid] != nil else { return }
      let endReason: CXCallEndedReason
      switch reason {
      case "unanswered": endReason = .unanswered
      case "failed": endReason = .failed
      case "answeredElsewhere": endReason = .answeredElsewhere
      case "declinedElsewhere": endReason = .declinedElsewhere
      default: endReason = .remoteEnded
      }
      forget(uuid)
      provider?.reportCall(with: uuid, endedAt: Date(), reason: endReason)
    }
  }

  /// Пользователь завершил звонок в нашем интерфейсе: говорим об этом системе.
  func requestEnd(callId: String, completion: @escaping (Bool) -> Void) {
    DispatchQueue.main.async { [self] in
      guard let uuid = UUID(uuidString: callId), calls[uuid] != nil else {
        completion(false)
        return
      }
      let transaction = CXTransaction(action: CXEndCallAction(call: uuid))
      callController.request(transaction) { error in completion(error == nil) }
    }
  }

  private func forget(_ uuid: UUID) {
    calls.removeValue(forKey: uuid)
    ringTimers[uuid]?.cancel()
    ringTimers.removeValue(forKey: uuid)
  }

  // MARK: - Показ входящего

  private func reportIncoming(
    uuid: UUID,
    info: CallKitCallInfo,
    completion: @escaping () -> Void
  ) {
    guard let provider = provider else {
      completion()
      return
    }
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: info.callerName)
    update.localizedCallerName = info.callerName
    update.hasVideo = info.video
    update.supportsHolding = false
    update.supportsGrouping = false
    update.supportsUngrouping = false
    update.supportsDTMF = false

    provider.reportNewIncomingCall(with: uuid, update: update) { [self] error in
      if error == nil {
        calls[uuid] = info
        scheduleRingTimeout(uuid)
        emit("onIncomingCall", ["callId": info.callId])
      }
      // Дубликат пуша (звонок уже показан) тоже не ошибка: главное — вызвать completion.
      completion()
    }
  }

  private func scheduleRingTimeout(_ uuid: UUID) {
    let item = DispatchWorkItem { [weak self] in
      guard let self = self, let info = self.calls[uuid], !info.answered else { return }
      self.forget(uuid)
      self.provider?.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
    }
    ringTimers[uuid]?.cancel()
    ringTimers[uuid] = item
    DispatchQueue.main.asyncAfter(deadline: .now() + CallKitCenter.ringTimeoutSeconds, execute: item)
  }

  // MARK: - PKPushRegistryDelegate

  func pushRegistry(
    _ registry: PKPushRegistry,
    didUpdate pushCredentials: PKPushCredentials,
    for type: PKPushType
  ) {
    guard type == .voIP else { return }
    let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    storedVoipToken = token
    emit("onVoipToken", ["token": token])
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP else { return }
    storedVoipToken = nil
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
    let dict = payload.dictionaryPayload
    func text(_ key: String) -> String {
      return (dict[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    let callId = text("callId")
    let validUuid = UUID(uuidString: callId)
    let uuid = validUuid ?? UUID()
    let name = text("callerName").isEmpty ? "Собеседник" : text("callerName")
    let info = CallKitCallInfo(
      callId: validUuid != nil ? callId.lowercased() : uuid.uuidString.lowercased(),
      callerName: name,
      video: text("callType") == "video",
      conversationId: text("conversationId"),
      callerId: text("callerId"),
      callerAvatar: text("callerAvatar"),
      answered: false
    )

    // Звонок уже показан (пуш пришёл дважды) — ничего не дублируем.
    if calls[uuid] != nil {
      completion()
      return
    }

    reportIncoming(uuid: uuid, info: info) { [self] in
      // Пуш без понятного идентификатора звонка: iOS требует показать звонок, поэтому показали и сразу закрываем.
      if validUuid == nil || text("type") != "incoming_call" {
        forget(uuid)
        provider?.reportCall(with: uuid, endedAt: Date(), reason: .failed)
      }
      completion()
    }
  }

  // MARK: - CXProviderDelegate

  func providerDidReset(_ provider: CXProvider) {
    for timer in ringTimers.values { timer.cancel() }
    ringTimers.removeAll()
    calls.removeAll()
  }

  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    if var info = calls[action.callUUID] {
      info.answered = true
      calls[action.callUUID] = info
      ringTimers[action.callUUID]?.cancel()
      ringTimers.removeValue(forKey: action.callUUID)
      emit(
        "onAnswerCall",
        [
          "callId": info.callId,
          "callerName": info.callerName,
          "callType": info.video ? "video" : "audio",
          "conversationId": info.conversationId,
          "callerId": info.callerId,
          "callerAvatar": info.callerAvatar,
        ]
      )
      action.fulfill()
    } else {
      action.fail()
    }
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    if let info = calls[action.callUUID] {
      forget(action.callUUID)
      emit("onEndCall", ["callId": info.callId, "answered": info.answered])
    }
    action.fulfill()
  }

  func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
    action.fulfill()
  }

  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    emit("onAudioSession", ["active": true])
  }

  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    emit("onAudioSession", ["active": false])
  }
}
