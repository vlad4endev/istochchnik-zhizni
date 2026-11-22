plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.istochnikzhizni.molitva"
    // 37: так требуют flutter_local_notifications и androidx.core 1.19; targetSdk остаётся от Flutter.
    compileSdk = 37
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // flutter_local_notifications использует java.time на старых Android.
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.istochnikzhizni.molitva"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["appLabel"] = "Источник жизни"
    }

    // Только телефоны: библиотеки эмуляторов (x86, x86_64) тянут лишние ~25 МБ.
    packaging {
        jniLibs {
            excludes += setOf("lib/x86/**", "lib/x86_64/**")
        }
    }

    // Тестовая сборка для телефона: PREVIEW_BUILD=1 flutter build apk ...
    // Отдельный пакет и название, чтобы ставилась рядом с основным приложением.
    if (System.getenv("PREVIEW_BUILD") == "1") {
        defaultConfig.applicationIdSuffix = ".preview"
        defaultConfig.manifestPlaceholders["appLabel"] = "Источник жизни тест"
    }

    // Общая подпись тестовых сборок. Раньше APK подписывался «отладочным» ключом, который
    // создаётся заново в каждой новой среде сборки — телефон тогда отказывался ставить новую
    // сборку поверх старой («приложение не установлено / не удалось обработать пакет»).
    // Это публичный тестовый ключ (пароль android), НЕ для магазина: для публикации нужен свой.
    signingConfigs {
        create("shared") {
            storeFile = file("shared-test.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
            enableV1Signing = true
            enableV2Signing = true
        }
    }

    buildTypes {
        release {
            // TODO: для публикации в магазине — свой ключ и key.properties вне git.
            signingConfig = signingConfigs.getByName("shared")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}
