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
          : 'Не удалось открыть выбор ($what). Попробуйте ещё раз.');
    } on PickerException {
      rethrow;
    } catch (_) {
      throw PickerException('Не удалось открыть выбор ($what). Попробуйте ещё раз.');
    }
  }

  PickedAttachment _fromXFile(XFile file) => PickedAttachment(path: file.path, name: file.name, mimeType: file.mimeType);

  @override
  Future<List<PickedAttachment>> photos() => _guard(() async {
        final picked = await _images.pickMultiImage(imageQuality: 85, limit: 10);
        return [for (final f in picked) _fromXFile(f)];
      }, 'фото');

  @override
  Future<PickedAttachment?> video() => _guard(() async {
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
        final picked = await FilePicker.pickFiles();
        return [
          for (final f in picked)
            if (f.path != null) PickedAttachment(path: f.path!, name: f.name),
        ];
      }, 'файлам');
}
