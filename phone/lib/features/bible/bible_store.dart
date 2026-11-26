import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'logic/audio_logic.dart';
import 'models/bible_models.dart';

enum BibleTheme {
  auto('Как в приложении'),
  light('Светлая'),
  dark('Тёмная'),
  black('Чёрная');

  const BibleTheme(this.label);
  final String label;
}

/// Настройки чтения Библии — одни на все главы.
class BibleSettings {
  const BibleSettings({
    this.fontSize = 19,
    this.theme = BibleTheme.auto,
    this.showNumbers = true,
    this.verseLines = false,
  });

  static const minFont = 15.0;
  static const maxFont = 30.0;

  final double fontSize;
  final BibleTheme theme;
  final bool showNumbers;

  /// Каждый стих с новой строки — удобно для изучения; иначе сплошным текстом.
  final bool verseLines;

  BibleSettings copyWith({double? fontSize, BibleTheme? theme, bool? showNumbers, bool? verseLines}) => BibleSettings(
        fontSize: (fontSize ?? this.fontSize).clamp(minFont, maxFont).toDouble(),
        theme: theme ?? this.theme,
        showNumbers: showNumbers ?? this.showNumbers,
        verseLines: verseLines ?? this.verseLines,
      );

  Map<String, dynamic> toJson() => {
        'font': fontSize,
        'theme': theme.name,
        'numbers': showNumbers,
        'lines': verseLines,
      };

  factory BibleSettings.fromJson(Map<String, dynamic> json) {
    final font = json['font'];
    return BibleSettings(
      fontSize: (font is num ? font.toDouble() : 19.0).clamp(minFont, maxFont).toDouble(),
      theme: BibleTheme.values.firstWhere((t) => t.name == json['theme'], orElse: () => BibleTheme.auto),
      showNumbers: json['numbers'] != false,
      verseLines: json['lines'] == true,
    );
  }
}

/// Всё, что Библия помнит на телефоне: перевод, настройки, место чтения, выделенные стихи.
class BibleStore {
  static const _translationKey = 'bible_translation';
  static const _settingsKey = 'bible_settings';
  static const _positionKey = 'bible_position';
  static const _recentKey = 'bible_recent';
  static const _highlightKey = 'bible_highlights';
  static const _audioPrefsKey = 'bible_audio_prefs';
  static const maxRecent = 8;
  static const _maxHighlightedChapters = 600;

  Future<SharedPreferences?> _prefs() async {
    try {
      return await SharedPreferences.getInstance();
    } catch (_) {
      return null;
    }
  }

  Future<String> translation() async => (await _prefs())?.getString(_translationKey) ?? 'synodal';

  Future<void> saveTranslation(String code) async => (await _prefs())?.setString(_translationKey, code);

  Future<BibleSettings> settings() async {
    try {
      final raw = (await _prefs())?.getString(_settingsKey);
      if (raw == null) return const BibleSettings();
      return BibleSettings.fromJson(Map<String, dynamic>.from(jsonDecode(raw) as Map));
    } catch (_) {
      return const BibleSettings();
    }
  }

  Future<void> saveSettings(BibleSettings value) async =>
      (await _prefs())?.setString(_settingsKey, jsonEncode(value.toJson()));

  Future<ReadingPosition?> position() async {
    try {
      final raw = (await _prefs())?.getString(_positionKey);
      return raw == null ? null : ReadingPosition.fromJson(jsonDecode(raw));
    } catch (_) {
      return null;
    }
  }

  Future<List<ReadingPosition>> recent() async {
    try {
      final raw = (await _prefs())?.getString(_recentKey);
      if (raw == null) return const [];
      return [for (final item in jsonDecode(raw) as List) ?ReadingPosition.fromJson(item)];
    } catch (_) {
      return const [];
    }
  }

  /// Запоминает место и обновляет «недавние»: одна глава встречается один раз.
  Future<List<ReadingPosition>> remember(ReadingPosition position) async {
    final prefs = await _prefs();
    if (prefs == null) return [position];
    await prefs.setString(_positionKey, jsonEncode(position.toJson()));
    final list = [
      position,
      for (final p in await recent())
        if (!(p.bookSlug == position.bookSlug && p.chapter == position.chapter && p.translation == position.translation)) p,
    ].take(maxRecent).toList();
    await prefs.setString(_recentKey, jsonEncode([for (final p in list) p.toJson()]));
    return list;
  }

  static String chapterKey(String translation, String bookSlug, int chapter) => '$translation|$bookSlug|$chapter';

  Future<Map<String, List<int>>> highlights() async {
    try {
      final raw = (await _prefs())?.getString(_highlightKey);
      if (raw == null) return {};
      final map = Map<String, dynamic>.from(jsonDecode(raw) as Map);
      return {
        for (final e in map.entries)
          if (e.value is List) e.key: [for (final v in e.value as List) if (v is int) v],
      };
    } catch (_) {
      return {};
    }
  }

  Future<void> saveHighlights(Map<String, List<int>> value) async {
    final entries = value.entries.where((e) => e.value.isNotEmpty).toList();
    // Старые главы не копим бесконечно: самые поздние записи остаются.
    final kept = entries.length > _maxHighlightedChapters ? entries.sublist(entries.length - _maxHighlightedChapters) : entries;
    await (await _prefs())?.setString(_highlightKey, jsonEncode({for (final e in kept) e.key: e.value}));
  }

  /// Скорость озвучки и автопереход к следующей главе — общие для всех глав.
  Future<({double rate, bool autoNext})> audioPrefs() async {
    try {
      final raw = (await _prefs())?.getString(_audioPrefsKey);
      if (raw == null) return (rate: 1.0, autoNext: true);
      final json = Map<String, dynamic>.from(jsonDecode(raw) as Map);
      final rate = json['rate'];
      return (rate: rate is num && audioRates.contains(rate.toDouble()) ? rate.toDouble() : 1.0, autoNext: json['autoNext'] != false);
    } catch (_) {
      return (rate: 1.0, autoNext: true);
    }
  }

  Future<void> saveAudioPrefs({required double rate, required bool autoNext}) async =>
      (await _prefs())?.setString(_audioPrefsKey, jsonEncode({'rate': rate, 'autoNext': autoNext}));
}
