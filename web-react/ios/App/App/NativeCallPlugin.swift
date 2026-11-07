import Foundation
import Capacitor
import AVFoundation
import UIKit

@objc(NativeCallPlugin)
public class NativeCallPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeCallPlugin"
    public let jsName = "NativeCall"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openNotificationSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startOngoing", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopOngoing", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerVoip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playRingtone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopRingtone", returnType: CAPPluginReturnPromise),
    ]

    private var lastVoipToken: String?
    private var audioEngine: AVAudioEngine?
    private var ringtoneTimer: Timer?
    private var vibrating = false

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
            self?.stopRingtoneInternal()
            self?.notifyListeners("accepted", data: payload)
        }
        manager.onDeclined = { [weak self] callId in
            self?.stopRingtoneInternal()
            self?.notifyListeners("declined", data: ["callId": callId])
        }
        manager.onEnded = { [weak self] callId in
            self?.stopRingtoneInternal()
            self?.notifyListeners("ended", data: ["callId": callId])
        }
        manager.onHangupRequested = { [weak self] callId in
            self?.stopRingtoneInternal()
            self?.notifyListeners("hangupRequested", data: ["callId": callId])
        }
        manager.start()
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": true])
    }

    /// Экран настроек приложения: после отказа iOS больше не показывает системный запрос.
    @objc func openNotificationSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("settings url unavailable")
                return
            }
            UIApplication.shared.open(url, options: [:]) { ok in
                if ok { call.resolve() } else { call.reject("cannot open settings") }
            }
        }
    }

    @objc func endCall(_ call: CAPPluginCall) {
        let callId = call.getString("callId") ?? ""
        stopRingtoneInternal()
        if !callId.isEmpty {
            CallKitManager.shared.endCall(callId: callId)
        }
        call.resolve()
    }

    /// Hold AVAudioSession + CallKit while LiveKit is connected (screen lock / background).
    @objc func startOngoing(_ call: CAPPluginCall) {
        let callId = call.getString("callId") ?? ""
        guard !callId.isEmpty else {
            call.reject("callId required")
            return
        }
        let peerName = call.getString("peerName") ?? "Собеседник"
        let callType = call.getString("callType") ?? "audio"
        let hasVideo = call.getBool("hasVideo") ?? (callType == "video")
        stopRingtoneInternal()
        DispatchQueue.main.async {
            CallKitManager.shared.startOngoing(callId: callId, peerName: peerName, hasVideo: hasVideo)
            call.resolve()
        }
    }

    @objc func stopOngoing(_ call: CAPPluginCall) {
        let callId = call.getString("callId") ?? ""
        DispatchQueue.main.async {
            if !callId.isEmpty {
                CallKitManager.shared.endCall(callId: callId)
            }
            call.resolve()
        }
    }

    @objc func registerVoip(_ call: CAPPluginCall) {
        CallKitManager.shared.start()
        if let token = lastVoipToken {
            call.resolve(["token": token])
        } else {
            call.resolve(["token": NSNull()])
        }
    }

    @objc func playRingtone(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.resolve()
                return
            }
            do {
                try self.startRingtoneInternal()
                call.resolve()
            } catch {
                call.reject("playRingtone failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func stopRingtone(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.stopRingtoneInternal()
            call.resolve()
        }
    }

    private func startRingtoneInternal() throws {
        stopRingtoneInternal()

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, options: [.duckOthers, .mixWithOthers])
        try session.setActive(true)

        let engine = AVAudioEngine()
        let mainMixer = engine.mainMixerNode
        let output = engine.outputNode
        let format = output.inputFormat(forBus: 0)
        let sampleRate = format.sampleRate > 0 ? format.sampleRate : 44_100

        // Two-tone ringtone burst via scheduled buffers (440 + 480 Hz)
        let freqs: [Double] = [440, 480]
        let burstSeconds = 0.4
        let frameCount = AVAudioFrameCount(sampleRate * burstSeconds)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
            throw NSError(domain: "NativeCall", code: 1, userInfo: [NSLocalizedDescriptionKey: "buffer"])
        }
        buffer.frameLength = frameCount
        if let channels = buffer.floatChannelData {
            let chCount = Int(format.channelCount)
            for i in 0..<Int(frameCount) {
                let t = Double(i) / sampleRate
                var sample: Float = 0
                for f in freqs {
                    sample += Float(sin(2.0 * Double.pi * f * t))
                }
                sample /= Float(freqs.count)
                // envelope
                let attack = min(1.0, t / 0.02)
                let release = t > burstSeconds - 0.04 ? max(0, (burstSeconds - t) / 0.04) : 1.0
                sample *= Float(0.35 * attack * release)
                for ch in 0..<chCount {
                    channels[ch][i] = sample
                }
            }
        }

        let player = AVAudioPlayerNode()
        engine.attach(player)
        engine.connect(player, to: mainMixer, format: format)
        engine.connect(mainMixer, to: output, format: format)
        try engine.start()
        player.play()

        audioEngine = engine

        // Pattern: double burst, pause, repeat (~2s cycle) like classic phone
        var phase = 0
        ringtoneTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self, weak player] _ in
            guard let self = self, let player = player, self.audioEngine != nil else { return }
            // phases 0 and 1: play burst; 2,3: silence
            if phase == 0 || phase == 1 {
                player.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
            }
            phase = (phase + 1) % 4
        }
        // play first burst immediately
        player.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)

        startVibration()
    }

    private func stopRingtoneInternal() {
        ringtoneTimer?.invalidate()
        ringtoneTimer = nil
        if let engine = audioEngine {
            engine.stop()
            audioEngine = nil
        }
        stopVibration()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func startVibration() {
        vibrating = true
        vibratePulse()
    }

    private func vibratePulse() {
        guard vibrating else { return }
        let generator = UIImpactFeedbackGenerator(style: .heavy)
        generator.prepare()
        generator.impactOccurred()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            guard let self = self, self.vibrating else { return }
            generator.impactOccurred()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.65) { [weak self] in
                self?.vibratePulse()
            }
        }
    }

    private func stopVibration() {
        vibrating = false
    }
}
