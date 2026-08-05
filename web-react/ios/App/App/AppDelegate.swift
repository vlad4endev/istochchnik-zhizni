import UIKit
import AVFoundation
import Capacitor
import UserNotifications
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?
    private var pendingPushPayload: [String: String]?
    private let maxDispatchAttempts = 20
    private let dispatchRetrySeconds = 0.15
    private var firebaseConfigured = false

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configureAudioSessionForBackgroundPlayback()
        configureFirebaseIfPossible()
        configureNotificationCategories()
        UNUserNotificationCenter.current().delegate = self

        if let remote = launchOptions?[.remoteNotification] as? [AnyHashable: Any] {
            pendingPushPayload = extractPushPayload(from: remote)
        }
        return true
    }

    /// Нужно, чтобы голосовые/аудио из WebView продолжали играть после сворачивания приложения.
    private func configureAudioSessionForBackgroundPlayback() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.allowAirPlay, .allowBluetoothA2DP])
            try session.setActive(true)
        } catch {
            print("[audio] AVAudioSession playback setup failed: \(error)")
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        flushPendingPushNavigation()
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    /// Bridge APNs → FCM so Capacitor `registration` receives an FCM token (not raw APNs hex).
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        guard firebaseConfigured else {
            NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
            return
        }
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let error = error {
                NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
            } else if let token = token {
                NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
            }
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .badge, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let payload = extractPushPayload(from: response.notification.request.content.userInfo)
        if payload["url"]?.isEmpty == false || payload["conversationId"]?.isEmpty == false {
            pendingPushPayload = payload
            flushPendingPushNavigation()
        }
        completionHandler()
    }

    private func configureFirebaseIfPossible() {
        guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else {
            print("[fcm] GoogleService-Info.plist missing — iOS push will not receive FCM tokens. See ios/PUSH_SETUP.md")
            firebaseConfigured = false
            return
        }
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        firebaseConfigured = FirebaseApp.app() != nil
    }

    private func configureNotificationCategories() {
        let messageCategory = UNNotificationCategory(
            identifier: "MESSAGE",
            actions: [],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )
        let generalCategory = UNNotificationCategory(
            identifier: "GENERAL",
            actions: [],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )
        UNUserNotificationCenter.current().setNotificationCategories([messageCategory, generalCategory])
    }

    private func flushPendingPushNavigation() {
        guard let payload = pendingPushPayload else { return }
        dispatchPushNavigation(payload: payload, attempt: 0)
    }

    private func dispatchPushNavigation(payload: [String: String], attempt: Int) {
        guard let bridgeVC = window?.rootViewController as? CAPBridgeViewController,
              let bridge = bridgeVC.bridge,
              let webView = bridge.webView else {
            if attempt >= maxDispatchAttempts { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + dispatchRetrySeconds) { [weak self] in
                self?.dispatchPushNavigation(payload: payload, attempt: attempt + 1)
            }
            return
        }

        guard let json = toJsonString(payload) else { return }
        let js = "window.dispatchEvent(new CustomEvent('app:native-push-navigate',{detail:\(json)}));"
        webView.evaluateJavaScript(js) { [weak self] _, _ in
            self?.pendingPushPayload = nil
        }
    }

    private func extractPushPayload(from userInfo: [AnyHashable: Any]) -> [String: String] {
        let url = String(describing: userInfo["url"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let conversationId = String(describing: userInfo["conversationId"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return [
            "url": url == "nil" ? "" : url,
            "conversationId": conversationId == "nil" ? "" : conversationId
        ]
    }

    private func toJsonString(_ payload: [String: String]) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
              let json = String(data: data, encoding: .utf8) else {
            return nil
        }
        return json
    }
}
