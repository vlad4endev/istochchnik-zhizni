import 'dart:async';

import 'package:flutter/foundation.dart';

import '../bible_store.dart';
import '../data/bible_repository.dart';
import '../logic/audio_logic.dart';
import '../models/bible_models.dart';
import 'audio_backend.dart';

/// Какая глава звучит.
class BibleTrack {
  const BibleTrack({
    required this.translation,
    required this.translationTitle,
    required this.bookSlug,
    required this.bookName,
    required this.chapter,
    required this.audio,
  });

  final String translation;
  final String translationTitle;
  final String bookSlug;
  final String bookName;
  final int chapter;
  final BibleAudio audio;

  String get title => '$bookName $chapter';

  bool isChapter(String translation, String bookSlug, int chapter) =>
      this.translation == translation && this.bookSlug == bookSlug && this.chapter == chapter;
}

enum AudioStatus { idle, loading, playing, paused }

enum SleepKind { off, minutes, chapterEnd }

/// Озвучка Библии: один плеер на всё приложение, чтобы звук не обрывался при переходах между экранами.
/// Скорость, таймер сна, автопереход к следующей главе, подсветка читаемого стиха.
class BiblePlayer extends ChangeNotifier {
  BiblePlayer({AudioBackend Function()? backendFactory, BibleStore? store, DateTime Function()? clock})
      : _factory = backendFactory ?? JustAudioBackend.new,
        _store = store ?? BibleStore(),
        _clock = clock ?? DateTime.now;

  /// Плеер приложения. Тесты создают свой — с подставным движком.
  static final BiblePlayer instance = BiblePlayer();

  final AudioBackend Function() _factory;
  final BibleStore _store;
  final DateTime Function() _clock;

  AudioBackend? _backend;
  final _subs = <StreamSubscription<Object?>>[];

  BibleTrack? track;
  AudioStatus status = AudioStatus.idle;
  double rate = 1.0;
  bool autoNext = true;
  SleepKind sleepKind = SleepKind.off;
  DateTime? sleepUntil;
  Duration duration = Duration.zero;

  /// Текст последней ошибки (нет сети, запись недоступна); экран показывает и сбрасывает.
  String? problem;

  /// Позиция и читаемый стих меняются часто — отдельно, чтобы экраны не перерисовывались целиком.
  final position = ValueNotifier<Duration>(Duration.zero);
  final activeVerse = ValueNotifier<int?>(null);

  /// Читалка регистрирует переход на следующую главу, пока открыта: глава листается на экране.
  void Function(String bookSlug, int chapter)? navigator;

  /// Откуда брать озвучку следующей главы, если читалка закрыта.
  BibleSource? source;
  List<BibleBook> books = const [];

  Timer? _sleepTimer;
  bool _prefsLoaded = false;
  int _loadToken = 0;
  bool _disposed = false;

  bool get isActive => track != null;

  bool get playing => status == AudioStatus.playing;

  bool isCurrent(String translation, String bookSlug, int chapter) => track?.isChapter(translation, bookSlug, chapter) ?? false;

  Duration get sleepLeft {
    final until = sleepUntil;
    if (sleepKind != SleepKind.minutes || until == null) return Duration.zero;
    final left = until.difference(_clock());
    return left.isNegative ? Duration.zero : left;
  }

  AudioBackend _engine() {
    final existing = _backend;
    if (existing != null) return existing;
    final backend = _factory();
    _backend = backend;
    _subs
      ..add(backend.position.listen(_onPosition))
      ..add(backend.duration.listen((d) {
        duration = d ?? Duration.zero;
        notifyListeners();
      }))
      ..add(backend.playing.listen(_onPlaying))
      ..add(backend.completed.listen((_) => unawaited(_onCompleted())));
    return backend;
  }

  Future<void> _loadPrefs() async {
    if (_prefsLoaded) return;
    _prefsLoaded = true;
    final prefs = await _store.audioPrefs();
    rate = prefs.rate;
    autoNext = prefs.autoNext;
  }

  void _onPosition(Duration value) {
    position.value = value;
    final t = track;
    activeVerse.value = t == null || status == AudioStatus.idle || status == AudioStatus.loading
        ? null
        : verseFromTimings(t.audio.timings, value.inMilliseconds / 1000);
  }

  void _onPlaying(bool isPlaying) {
    if (track == null || status == AudioStatus.loading) return;
    final next = isPlaying ? AudioStatus.playing : AudioStatus.paused;
    if (next == status) return;
    status = next;
    notifyListeners();
  }

  /// Включает главу. [fromVerse] — начать с этого стиха (если в разметке он есть).
  Future<void> playChapter(BibleTrack next, {int? fromVerse, bool autoplay = true}) async {
    await _loadPrefs();
    final token = ++_loadToken;
    final start = fromVerse == null ? null : startOfVerse(next.audio.timings, fromVerse);
    track = next;
    status = AudioStatus.loading;
    problem = null;
    duration = Duration.zero;
    position.value = Duration.zero;
    activeVerse.value = null;
    notifyListeners();
    final engine = _engine();
    try {
      await engine.load(next.audio.url, start: Duration(milliseconds: ((start ?? 0) * 1000).round()));
      if (token != _loadToken || _disposed) return;
      await engine.setSpeed(rate);
      status = AudioStatus.paused;
      if (autoplay) {
        status = AudioStatus.playing;
        notifyListeners();
        unawaited(engine.play());
      }
    } catch (_) {
      if (token != _loadToken || _disposed) return;
      status = AudioStatus.paused;
      problem = 'Не удалось включить озвучку. Проверьте интернет и попробуйте снова.';
    }
    notifyListeners();
  }

  Future<void> toggle() async {
    final engine = _backend;
    if (engine == null || track == null || status == AudioStatus.loading) return;
    if (status == AudioStatus.playing) {
      status = AudioStatus.paused;
      notifyListeners();
      await engine.pause();
    } else {
      status = AudioStatus.playing;
      notifyListeners();
      await engine.play();
    }
  }

  Future<void> seek(Duration to) async {
    final engine = _backend;
    if (engine == null || track == null) return;
    final max = duration;
    var target = to < Duration.zero ? Duration.zero : to;
    if (max > Duration.zero && target > max) target = max;
    position.value = target;
    await engine.seek(target);
  }

  Future<void> skipBy(Duration delta) => seek(position.value + delta);

  Future<void> setRate(double value) async {
    if (!audioRates.contains(value)) return;
    rate = value;
    notifyListeners();
    await _backend?.setSpeed(value);
    await _store.saveAudioPrefs(rate: rate, autoNext: autoNext);
  }

  /// Следующая скорость по кругу: 1× → 1,25× → 1,5× → 2× → 0,75× → 1×.
  Future<void> cycleRate() => setRate(audioRates[(audioRates.indexOf(rate) + 1) % audioRates.length]);

  Future<void> setAutoNext(bool value) async {
    autoNext = value;
    notifyListeners();
    await _store.saveAudioPrefs(rate: rate, autoNext: autoNext);
  }

  // ——— таймер сна ———

  void sleepOff() {
    _sleepTimer?.cancel();
    sleepKind = SleepKind.off;
    sleepUntil = null;
    notifyListeners();
  }

  void sleepInMinutes(int minutes) {
    _sleepTimer?.cancel();
    sleepKind = SleepKind.minutes;
    sleepUntil = _clock().add(Duration(minutes: minutes));
    _sleepTimer = Timer(Duration(minutes: minutes), () {
      unawaited(_backend?.pause());
      status = track == null ? AudioStatus.idle : AudioStatus.paused;
      sleepOff();
    });
    notifyListeners();
  }

  void sleepAtChapterEnd() {
    _sleepTimer?.cancel();
    sleepKind = SleepKind.chapterEnd;
    sleepUntil = null;
    notifyListeners();
  }

  // ——— конец главы ———

  Future<void> _onCompleted() async {
    final current = track;
    if (current == null || _disposed) return;
    status = AudioStatus.paused;
    position.value = Duration.zero;
    activeVerse.value = null;
    if (sleepKind == SleepKind.chapterEnd) {
      sleepOff();
      return;
    }
    notifyListeners();
    if (!autoNext) return;
    final target = nextChapterAfter(books, current.bookSlug, current.chapter);
    if (target == null) return;
    final go = navigator;
    if (go != null) {
      go(target.slug, target.chapter);
      return;
    }
    // Читалка закрыта — просто продолжаем слушать следующую главу.
    final src = source;
    if (src == null) return;
    final audio = await src.audio(current.translation, target.slug, target.chapter);
    if (audio == null || _disposed || track != current) return;
    await playChapter(
      BibleTrack(
        translation: current.translation,
        translationTitle: current.translationTitle,
        bookSlug: target.slug,
        bookName: target.name,
        chapter: target.chapter,
        audio: audio,
      ),
    );
  }

  void clearProblem() => problem = null;

  /// Остановить и убрать мини-плеер.
  Future<void> close() async {
    _loadToken++;
    _sleepTimer?.cancel();
    sleepKind = SleepKind.off;
    sleepUntil = null;
    track = null;
    status = AudioStatus.idle;
    duration = Duration.zero;
    position.value = Duration.zero;
    activeVerse.value = null;
    notifyListeners();
    try {
      await _backend?.stop();
    } catch (_) {}
  }

  @override
  void dispose() {
    _disposed = true;
    _sleepTimer?.cancel();
    for (final s in _subs) {
      s.cancel();
    }
    unawaited(_backend?.dispose());
    position.dispose();
    activeVerse.dispose();
    super.dispose();
  }
}
