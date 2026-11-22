import 'package:shared_preferences/shared_preferences.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../logic/attachment_logic.dart';

/// Выбор вложения не удался: нет доступа, нет приложения для выбора и т. п. Текст понятен человеку.
class PickerException implements Exception {
  const PickerException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Откуда берутся вложения. Отдельный интерфейс — чтобы проверять без телефона.
abstract class AttachmentPicker {
  /// Несколько фото из галереи; пусто — человек ничего не выбрал.
  Future<List<PickedAttachment>> photos();
  Future<PickedAttachment?> video();
  Future<PickedAttachment?> camera();
  Future<List<PickedAttachment>> files();

  /// Запасной путь: выбор через системные «Файлы» (иначе устроен, чем галерея). [kind] — `image` или `video`.
  Future<List<PickedAttachment>> viaFiles(String kind);

  /// Запомнить, что галерея на этом телефоне не отвечает, и дальше открывать «Файлы» сразу.
  Future<void> preferFiles();
}

class DeviceAttachmentPicker implements AttachmentPicker {
  DeviceAttachmentPicker({ImagePicker? images}) : _images = images ?? ImagePicker();
  final ImagePicker _images;

  Future<T> _guard<T>(Future<T> Function() call, String what) async {
    try {
      return await call();
    } on PlatformException catch (e) {
      final denied = e.code.toLowerCase().contains('denied') || '${e.message}'.toLowerCase().contains('permission');
      throw PickerException(denied
          ? 'Нет доступа к $what. Разрешите его в настройках телефона.'
          : 'Не удалось открыть выбор ($what, код: ${e.code}). Попробуйте ещё раз.');
    } on PickerException {
      rethrow;
    } catch (e) {
      throw PickerException('Не удалось открыть выбор ($what, код: ${e.runtimeType}). Попробуйте ещё раз.');
    }
  }

  PickedAttachment _fromXFile(XFile file) => PickedAttachment(path: file.path, name: file.name, mimeType: file.mimeType);

  /// Файлы без пути на телефоне (облачные, недоступные) раньше пропадали молча — теперь объясняем.
  List<PickedAttachment> _readable(List<PlatformFile> picked) {
    final ok = [
      for (final f in picked)
        if (f.path != null) PickedAttachment(path: f.path!, name: f.name),
    ];
    if (picked.isNotEmpty && ok.isEmpty) {
      throw const PickerException('Не удалось прочитать выбранный файл. Скачайте его на телефон и выберите снова.');
    }
    return ok;
  }

  static const _preferFilesKey = 'attach_prefer_files';

  Future<bool> _prefersFiles() async {
    try {
      return (await SharedPreferences.getInstance()).getBool(_preferFilesKey) ?? false;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<void> preferFiles() async {
    try {
      await (await SharedPreferences.getInstance()).setBool(_preferFilesKey, true);
    } catch (_) {}
  }

  @override
  Future<List<PickedAttachment>> viaFiles(String kind) => _guard(() async {
        return _readable(await FilePicker.pickFiles(type: kind == 'video' ? FileType.video : FileType.image));
      }, 'файлам');

  @override
  Future<List<PickedAttachment>> photos() => _guard(() async {
        if (await _prefersFiles()) return viaFiles('image');
        final picked = await _images.pickMultiImage(imageQuality: 85, limit: 10);
        return [for (final f in picked) _fromXFile(f)];
      }, 'фото');

  @override
  Future<PickedAttachment?> video() => _guard(() async {
        if (await _prefersFiles()) return (await viaFiles('video')).firstOrNull;
        final file = await _images.pickVideo(source: ImageSource.gallery);
        return file == null ? null : _fromXFile(file);
      }, 'видео');

  @override
  Future<PickedAttachment?> camera() => _guard(() async {
        final file = await _images.pickImage(source: ImageSource.camera, imageQuality: 85);
        return file == null ? null : _fromXFile(file);
      }, 'камере');

  @override
  Future<List<PickedAttachment>> files() => _guard(() async {
        return _readable(await FilePicker.pickFiles());
      }, 'файлам');
}
