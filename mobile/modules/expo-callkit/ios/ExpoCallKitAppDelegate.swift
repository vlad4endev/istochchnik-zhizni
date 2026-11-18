import ExpoModulesCore
import UIKit

/// Запускает приём VoIP-пушей при старте приложения — в том числе когда iOS будит его пушем в фоне.
public class ExpoCallKitAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    CallKitCenter.shared.start()
    return true
  }
}
