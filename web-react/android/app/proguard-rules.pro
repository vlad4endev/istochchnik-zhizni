# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# --- R8 (release, minifyEnabled true) ---
# Capacitor и Firebase поставляют свои consumer-правила (плагины @CapacitorPlugin, методы
# @PluginMethod, FirebaseMessagingService). Ниже — страховка для того, что ломается тихо.

# Мост WebView <-> нативный код вызывается по имени из JS.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Аннотации и generics читаются рефлексией (Capacitor, Gson/JSON в плагинах).
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Читаемые стектрейсы из Play Console / Crashlytics.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Плагин push вызывается из AppFirebaseMessagingService напрямую.
-keep class com.capacitorjs.plugins.pushnotifications.** { *; }
