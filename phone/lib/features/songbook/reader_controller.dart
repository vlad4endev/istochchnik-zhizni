import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'data/songbook_repository.dart';
import 'logic/chords.dart';
import 'logic/song_format.dart';
import 'models/song.dart';

enum ReaderTheme {
  black('Чёрная'),
  dark('Тёмная'),
  light('Светлая');

  const ReaderTheme(this.label);
  final String label;
}

/// Настройки чтения — одни на все песни.
class ReaderSettings {
  const ReaderSettings({
    this.showChords = true,
    this.fontSize = 22,
    this.theme = ReaderTheme.black,
    this.concertChords = false,
    this.keepAwake = true,
    this.scrollSpeed = 3,
  });

  static const minFont = 14.0;
  static const maxFont = 34.0;
  static const speeds = 5;

  final bool showChords;
  final double fontSize;
  final ReaderTheme theme;

  /// С каподастром показывать то, что звучит, а не то, что играть.
  final bool concertChords;
  final bool keepAwake;
  final int scrollSpeed;

  ReaderSettings copyWith({
    bool? showChords,
    double? fontSize,
    ReaderTheme? theme,
    bool? concertChords,
    bool? keepAwake,
    int? scrollSpeed,
  }) =>
      ReaderSettings(
        showChords: showChords ?? this.showChords,
        fontSize: (fontSize ?? this.fontSize).clamp(minFont, maxFont),
        theme: theme ?? this.theme,
        concertChords: concertChords ?? this.concertChords,
        keepAwake: keepAwake ?? this.keepAwake,
        scrollSpeed: (scrollSpeed ?? this.scrollSpeed).clamp(1, speeds),
      );

  Map<String, dynamic> toJson() => {
        'showChords': showChords,
        'fontSize': fontSize,
        'theme': theme.name,
        'concertChords': concertChords,
        'keepAwake': keepAwake,
        'scrollSpeed': scrollSpeed,
      };

  factory ReaderSettings.fromJson(Map<String, dynamic> json) {
    const d = ReaderSettings();
    return ReaderSettings(
      showChords: json['showChords'] is bool ? json['showChords'] as bool : d.showChords,
      fontSize: ((json['fontSize'] is num ? (json['fontSize'] as num).toDouble() : d.fontSize)).clamp(minFont, maxFont),
      theme: ReaderTheme.values.where((t) => t.name == json['theme']).firstOrNull ?? d.theme,
      concertChords: json['concertChords'] is bool ? json['concertChords'] as bool : d.concertChords,
      keepAwake: json['keepAwake'] is bool ? json['keepAwake'] as bool : d.keepAwake,
      scrollSpeed: (json['scrollSpeed'] is int ? json['scrollSpeed'] as int : d.scrollSpeed).clamp(1, speeds),
    );
  }
}

/// Сдвиг тональности и каподастр, которые человек выбрал для конкретной песни.
class SongPrefs {
  const SongPrefs({this.transpose = 0, this.capo = 0});
  final int transpose;
  final int capo;
  bool get isDefault => transpose == 0 && capo == 0;
}

/// Хранилище настроек читалки (на телефоне).
class ReaderStore {
  static const _settingsKey = 'reader_settings';
  static const _songsKey = 'reader_song_prefs';
  static const _maxSongs = 300;

  static Future<ReaderSettings> loadSettings() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_settingsKey);
      if (raw == null) return const ReaderSettings();
      return ReaderSettings.fromJson(Map<String, dynamic>.from(jsonDecode(raw) as Map));
    } catch (_) {
      return const ReaderSettings();
    }
  }

  static Future<void> saveSettings(ReaderSettings settings) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_settingsKey, jsonEncode(settings.toJson()));
  }

  static Future<Map<String, dynamic>> _songMap(SharedPreferences prefs) async {
    try {
      final raw = prefs.getString(_songsKey);
      return raw == null ? {} : Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return {};
    }
  }

  static Future<SongPrefs> loadSong(int songId) async {
    if (songId <= 0) return const SongPrefs();
    final prefs = await SharedPreferences.getInstance();
    final entry = (await _songMap(prefs))['$songId'];
    if (entry is! Map) return const SongPrefs();
    final t = entry['t'];
    final c = entry['c'];
    return SongPrefs(
      transpose: t is int ? t.clamp(-11, 11) : 0,
      capo: c is int ? c.clamp(0, 11) : 0,
    );
  }

  static Future<void> saveSong(int songId, SongPrefs value) async {
    if (songId <= 0) return;
    final prefs = await SharedPreferences.getInstance();
    final map = await _songMap(prefs);
    map.remove('$songId');
    if (!value.isDefault) map['$songId'] = {'t': value.transpose, 'c': value.capo};
    // Храним последние песни, чтобы не копить без конца.
    while (map.length > _maxSongs) {
      map.remove(map.keys.first);
    }
    await prefs.setString(_songsKey, jsonEncode(map));
  }
}

/// Всё, что меняется при чтении песни: тональность, каподастр, настройки, текст.
class ReaderController extends ChangeNotifier {
  ReaderController({required Song song, this.source}) : _song = song {
    _content = song.content;
    _parsed = parseSong(_content);
  }

  final SongbookSource? source;
  final Song _song;
  late String _content;
  late ParsedSong _parsed;
  String? _versionKey;
  bool usingMyVersion = false;

  ReaderSettings settings = const ReaderSettings();
  int transpose = 0;
  int capo = 0;
  bool ready = false;
  bool _disposed = false;

  List<SongBlock>? _blocksCache;
  int? _blocksShift;
  bool? _blocksFlats;

  Song get song => _song;
  ParsedSong get parsed => _parsed;

  /// Есть ли в песне аккорды, которые можно двигать.
  bool get hasChords => _parsed.blocks.any((b) => (b is LineBlock && b.hasChords) || b is ChordRowBlock);

  /// Тональность, указанная в каталоге (или в моей версии).
  String? get declaredKey {
    final k = (_versionKey ?? _song.keyLabel)?.trim();
    return k == null || k.isEmpty ? null : k;
  }

  /// Тональность или догадка по первому аккорду — только чтобы выбрать бемоли и диезы.
  String? get _keyGuess => declaredKey ?? _parsed.firstChord;

  /// Тональность, в которой песня звучит сейчас.
  String? get soundingKey => declaredKey == null ? null : transposeKey(declaredKey!, transpose, hStyle: _parsed.usesH);

  /// Сдвиг аккордов на экране относительно записи в тексте.
  int get shift => shapeShift(transpose: transpose, capo: capo, concert: settings.concertChords);

  bool get changed => transpose != 0 || capo != 0;

  bool get preferFlats {
    final key = _keyGuess;
    if (key == null) return false;
    return keyPrefersFlatsAfter(key, shift, hSongStyle: _parsed.usesH);
  }

  List<SongBlock> get blocks {
    final flats = preferFlats;
    if (_blocksCache == null || _blocksShift != shift || _blocksFlats != flats) {
      _blocksCache = shiftBlocks(_parsed, shift, preferFlats: flats);
      _blocksShift = shift;
      _blocksFlats = flats;
    }
    return _blocksCache!;
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  // ------------------------------------------------------------ загрузка

  Future<void> init() async {
    settings = await ReaderStore.loadSettings();
    final prefs = await ReaderStore.loadSong(_song.id);
    transpose = prefs.transpose;
    capo = prefs.capo;
    ready = true;
    _changed();
  }

  /// Моя версия песни из студии: свой текст и тональность.
  Future<void> loadMyVersion() async {
    if (!_song.hasStudioVersion || source == null) return;
    final version = await source!.studioVersion(_song.id);
    if (version == null || _disposed) return;
    if (version.content != null) {
      _content = version.content!;
      _parsed = parseSong(_content);
      _blocksCache = null;
    }
    _versionKey = version.key;
    usingMyVersion = true;
    _changed();
  }

  // ------------------------------------------------------------ тональность и каподастр

  void changeTranspose(int delta) {
    transpose = (transpose + delta).clamp(-11, 11);
    _saveSong();
    _changed();
  }

  /// Перейти сразу в выбранную тональность («Выбрать тональность»).
  void setSoundingKey(String key) {
    final base = declaredKey;
    if (base == null) return;
    transpose = semitonesBetween(base, key);
    _saveSong();
    _changed();
  }

  void changeCapo(int delta) {
    capo = (capo + delta).clamp(0, 11);
    _saveSong();
    _changed();
  }

  void resetSong() {
    transpose = 0;
    capo = 0;
    _saveSong();
    _changed();
  }

  void _saveSong() => unawaited(ReaderStore.saveSong(_song.id, SongPrefs(transpose: transpose, capo: capo)));

  // ------------------------------------------------------------ настройки

  void update(ReaderSettings next, {bool persist = true}) {
    settings = next;
    if (persist) unawaited(ReaderStore.saveSettings(next));
    _changed();
  }

  void setShowChords(bool v) => update(settings.copyWith(showChords: v));
  void setTheme(ReaderTheme v) => update(settings.copyWith(theme: v));
  void setConcert(bool v) => update(settings.copyWith(concertChords: v));
  void setKeepAwake(bool v) => update(settings.copyWith(keepAwake: v));
  void setScrollSpeed(int v) => update(settings.copyWith(scrollSpeed: v));
  void setFontSize(double v, {bool persist = true}) => update(settings.copyWith(fontSize: v), persist: persist);
  void bumpFont(int delta) => setFontSize((settings.fontSize + delta).roundToDouble());

  /// Ключи для выбора тональности: 12 тональностей по высоте, в записи как у оригинала.
  List<String> keyChoices() {
    final base = declaredKey;
    if (base == null) return const [];
    final root = ChordSymbol.tryParse(base, allowCyrillic: true)?.root;
    if (root == null) return const [];
    final out = <int, String>{};
    for (var d = 0; d < 12; d++) {
      final name = transposeKey(base, d, hStyle: _parsed.usesH);
      final target = ChordSymbol.tryParse(name, allowCyrillic: true, hSongStyle: _parsed.usesH);
      out[target?.root ?? (root + d) % 12] = name;
    }
    return [for (var r = 0; r < 12; r++) if (out[r] != null) out[r]!];
  }
}
