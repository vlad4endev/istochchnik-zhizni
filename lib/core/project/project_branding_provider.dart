import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image/image.dart' as img;
import 'package:shared_preferences/shared_preferences.dart';

const String _defaultAppName = 'МОЯ ЦЕРКОВЬ';
const String _defaultDescription = 'Молитвенный календарь церкви';
const String _defaultLogoAssetPath = 'assets/logo_primary.png';
const String _legacyDefaultLogoAssetPath = 'assets/logo.svg';
const bool _defaultRemoveLightBackground = true;
const int _defaultLogoScalePercent = 110;
const int _maxLogoDataUrlChars = 900000;

class ProjectBrandingSettings {
  const ProjectBrandingSettings({
    required this.appName,
    required this.description,
    required this.logoAssetPath,
    required this.removeLightBackground,
    required this.logoScalePercent,
    this.customLogoDataUrl,
  });

  final String appName;
  final String description;
  final String logoAssetPath;
  final bool removeLightBackground;
  final int logoScalePercent;
  final String? customLogoDataUrl;

  static const defaults = ProjectBrandingSettings(
    appName: _defaultAppName,
    description: _defaultDescription,
    logoAssetPath: _defaultLogoAssetPath,
    removeLightBackground: _defaultRemoveLightBackground,
    logoScalePercent: _defaultLogoScalePercent,
  );

  ProjectBrandingSettings copyWith({
    String? appName,
    String? description,
    String? logoAssetPath,
    bool? removeLightBackground,
    int? logoScalePercent,
    String? customLogoDataUrl,
    bool clearCustomLogo = false,
  }) {
    return ProjectBrandingSettings(
      appName: appName ?? this.appName,
      description: description ?? this.description,
      logoAssetPath: logoAssetPath ?? this.logoAssetPath,
      removeLightBackground:
          removeLightBackground ?? this.removeLightBackground,
      logoScalePercent: logoScalePercent ?? this.logoScalePercent,
      customLogoDataUrl: clearCustomLogo
          ? null
          : (customLogoDataUrl ?? this.customLogoDataUrl),
    );
  }

  Map<String, String?> toStorageMap() {
    return {
      'app_name': appName,
      'description': description,
      'logo_asset_path': logoAssetPath,
      'remove_light_background': removeLightBackground.toString(),
      'logo_scale_percent': logoScalePercent.toString(),
      'custom_logo_data_url': customLogoDataUrl,
    };
  }

  factory ProjectBrandingSettings.fromStorageMap(Map<String, String?> map) {
    final parsedLogoAssetPath = (map['logo_asset_path'] ?? '').trim();
    final logoAssetPath =
        parsedLogoAssetPath.isEmpty ||
            parsedLogoAssetPath == _legacyDefaultLogoAssetPath
        ? _defaultLogoAssetPath
        : parsedLogoAssetPath;

    return ProjectBrandingSettings(
      appName: (map['app_name'] ?? '').trim().isEmpty
          ? _defaultAppName
          : map['app_name']!.trim(),
      description: (map['description'] ?? '').trim().isEmpty
          ? _defaultDescription
          : map['description']!.trim(),
      logoAssetPath: logoAssetPath,
      removeLightBackground:
          (map['remove_light_background'] ?? '').trim().toLowerCase() !=
          'false',
      logoScalePercent:
          int.tryParse(
            (map['logo_scale_percent'] ?? '').trim(),
          )?.clamp(80, 160) ??
          _defaultLogoScalePercent,
      customLogoDataUrl: (map['custom_logo_data_url'] ?? '').trim().isEmpty
          ? null
          : map['custom_logo_data_url']!.trim(),
    );
  }

  String toJson() => jsonEncode(toStorageMap());

  factory ProjectBrandingSettings.fromJson(String? value) {
    if (value == null || value.trim().isEmpty) {
      return defaults;
    }
    try {
      final parsed = jsonDecode(value);
      if (parsed is! Map<String, dynamic>) {
        return defaults;
      }
      final map = parsed.map(
        (key, val) => MapEntry(key.toString(), val?.toString()),
      );
      return ProjectBrandingSettings.fromStorageMap(map);
    } catch (_) {
      return defaults;
    }
  }
}

final projectBrandingProvider =
    AsyncNotifierProvider<ProjectBrandingNotifier, ProjectBrandingSettings>(
      ProjectBrandingNotifier.new,
    );

final projectBrandingValueProvider = Provider<ProjectBrandingSettings>((ref) {
  return ref.watch(projectBrandingProvider).valueOrNull ??
      ProjectBrandingSettings.defaults;
});

class ProjectBrandingNotifier extends AsyncNotifier<ProjectBrandingSettings> {
  static const _storageKey = 'project_branding_settings_v1';

  @override
  Future<ProjectBrandingSettings> build() async {
    final prefs = await SharedPreferences.getInstance();
    return ProjectBrandingSettings.fromJson(prefs.getString(_storageKey));
  }

  Future<void> updateSettings({
    String? appName,
    String? description,
    String? logoAssetPath,
    bool? removeLightBackground,
    int? logoScalePercent,
    String? customLogoDataUrl,
    bool clearCustomLogo = false,
  }) async {
    final current = state.valueOrNull ?? ProjectBrandingSettings.defaults;
    final effectiveRemoveLightBackground =
        removeLightBackground ?? current.removeLightBackground;
    final effectiveScalePercent = (logoScalePercent ?? current.logoScalePercent)
        .clamp(80, 160);

    final incomingRawDataUrl = clearCustomLogo
        ? null
        : (customLogoDataUrl ?? current.customLogoDataUrl);
    final incomingProcessedDataUrl = clearCustomLogo
        ? null
        : (customLogoDataUrl ?? current.customLogoDataUrl);

    String? resolvedProcessedDataUrl = incomingProcessedDataUrl;
    if (!clearCustomLogo &&
        incomingRawDataUrl != null &&
        incomingRawDataUrl.trim().isNotEmpty) {
      resolvedProcessedDataUrl = _processLogoDataUrl(
        incomingRawDataUrl.trim(),
        removeLightBackground: effectiveRemoveLightBackground,
      );
      resolvedProcessedDataUrl = _fitLogoDataUrlToStorage(
        resolvedProcessedDataUrl,
      );
    }

    final next = current.copyWith(
      appName: appName != null && appName.trim().isNotEmpty
          ? appName.trim()
          : current.appName,
      description: description != null && description.trim().isNotEmpty
          ? description.trim()
          : (description == '' ? '' : current.description),
      logoAssetPath: logoAssetPath != null && logoAssetPath.trim().isNotEmpty
          ? logoAssetPath.trim()
          : current.logoAssetPath,
      removeLightBackground: effectiveRemoveLightBackground,
      logoScalePercent: effectiveScalePercent,
      customLogoDataUrl: resolvedProcessedDataUrl,
      clearCustomLogo: clearCustomLogo,
    );

    final prefs = await SharedPreferences.getInstance();
    try {
      await prefs.setString(_storageKey, next.toJson());
      state = AsyncData(next);
    } catch (_) {
      // Browser localStorage quota can overflow on very large logos.
      final fallback = next.copyWith(clearCustomLogo: true);
      try {
        await prefs.setString(_storageKey, fallback.toJson());
      } catch (_) {}
      state = AsyncData(fallback);
    }
  }

  Future<void> resetDefaults() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_storageKey);
    state = const AsyncData(ProjectBrandingSettings.defaults);
  }
}

String _processLogoDataUrl(
  String dataUrl, {
  required bool removeLightBackground,
}) {
  try {
    final split = dataUrl.split(',');
    if (split.length != 2) return dataUrl;
    final meta = split.first.toLowerCase();
    final payload = split.last;
    final bytes = base64Decode(payload);

    if (meta.contains('image/svg+xml')) {
      // Keep SVG as-is (already compact in most cases).
      return dataUrl.trim();
    }

    final optimized = _prepareRasterLogoBytes(
      bytes,
      removeLightBackground: removeLightBackground,
    );
    return 'data:image/png;base64,${base64Encode(optimized)}';
  } catch (_) {
    return dataUrl;
  }
}

String _fitLogoDataUrlToStorage(String dataUrl) {
  if (dataUrl.length <= _maxLogoDataUrlChars) {
    return dataUrl;
  }

  try {
    final split = dataUrl.split(',');
    if (split.length != 2) return dataUrl;
    final meta = split.first.toLowerCase();
    if (!meta.contains('image/')) return dataUrl;
    if (meta.contains('svg')) return dataUrl;

    final bytes = base64Decode(split.last);
    final decoded = img.decodeImage(bytes);
    if (decoded == null) return dataUrl;

    // Aggressive fallback resize for web storage quota.
    final reduced = img.copyResize(
      decoded,
      width: decoded.width >= decoded.height ? 320 : null,
      height: decoded.height > decoded.width ? 320 : null,
      interpolation: img.Interpolation.average,
    );
    final encoded = Uint8List.fromList(img.encodePng(reduced, level: 9));
    final next = 'data:image/png;base64,${base64Encode(encoded)}';
    return next.length <= _maxLogoDataUrlChars ? next : dataUrl;
  } catch (_) {
    return dataUrl;
  }
}

Uint8List _prepareRasterLogoBytes(
  Uint8List source, {
  required bool removeLightBackground,
}) {
  final decoded = img.decodeImage(source);
  if (decoded == null) {
    return source;
  }

  var working = img.Image.from(decoded);

  if (removeLightBackground) {
    for (var y = 0; y < working.height; y++) {
      for (var x = 0; x < working.width; x++) {
        final px = working.getPixel(x, y);
        final alpha = px.a.toInt();
        if (alpha == 0) continue;

        final r = px.r.toInt();
        final g = px.g.toInt();
        final b = px.b.toInt();
        final drg = (r - g).abs();
        final dgb = (g - b).abs();
        final drb = (r - b).abs();
        final almostNeutral = drg <= 14 && dgb <= 14 && drb <= 14;
        final nearWhite = r >= 242 && g >= 242 && b >= 242;
        final nearLightGray = almostNeutral && r >= 206 && g >= 206 && b >= 206;

        if (nearWhite || nearLightGray) {
          working.setPixelRgba(x, y, r, g, b, 0);
        }
      }
    }
  }

  final bounds = _opaqueBounds(working);
  if (bounds != null) {
    working = img.copyCrop(
      working,
      x: bounds.$1,
      y: bounds.$2,
      width: bounds.$3,
      height: bounds.$4,
    );
  }

  final side = math.max(working.width, working.height);
  final pad = math.max(8, (side * 0.06).round());
  final canvas = img.Image(
    width: working.width + pad * 2,
    height: working.height + pad * 2,
    numChannels: 4,
  );
  img.compositeImage(canvas, working, dstX: pad, dstY: pad);

  return Uint8List.fromList(img.encodePng(canvas, level: 6));
}

(int, int, int, int)? _opaqueBounds(img.Image image) {
  var minX = image.width;
  var minY = image.height;
  var maxX = -1;
  var maxY = -1;

  for (var y = 0; y < image.height; y++) {
    for (var x = 0; x < image.width; x++) {
      final alpha = image.getPixel(x, y).a.toInt();
      if (alpha <= 8) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return (minX, minY, maxX - minX + 1, maxY - minY + 1);
}
