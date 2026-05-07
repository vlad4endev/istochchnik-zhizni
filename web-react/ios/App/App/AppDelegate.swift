import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?
    private var pendingPushPayload: [String: String]?
    private let maxDispatchAttempts = 20
    private let dispatchRetrySeconds = 0.15

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configureNotificationCategories()
        UNUserNotificationCenter.current().delegate = self

        if let remote = launchOptions?[.remoteNotification] as? [AnyHashable: Any] {
            pendingPushPayload = extractPushPayload(from: remote)
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        flushPendingPushNavigation()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
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
