import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import {
  MAX_ALBUM_ITEMS,
  classifyAttachment,
  safeFileName,
  validateAttachment,
  type AttachmentDraft,
} from './attachments';

export type PickResult = {
  items: AttachmentDraft[];
  /** Понятное сообщение для пользователя: отказ в доступе или слишком большой файл. */
  error: string | null;
};

const EMPTY: PickResult = { items: [], error: null };

function extFromMime(mime: string): string {
  const sub = mime.split('/')[1]?.split(';')[0]?.trim();
  if (!sub) return '';
  return sub === 'jpeg' ? '.jpg' : sub === 'quicktime' ? '.mov' : `.${sub}`;
}

function fromImageAssets(assets: ImagePicker.ImagePickerAsset[]): PickResult {
  const items: AttachmentDraft[] = [];
  let error: string | null = null;
  assets.forEach((a, i) => {
    const mime = a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg');
    const name = safeFileName(a.fileName, `${a.type === 'video' ? 'video' : 'photo'}-${Date.now()}-${i}${extFromMime(mime)}`);
    const draft: AttachmentDraft = {
      uri: a.uri,
      name,
      mimeType: mime,
      size: a.fileSize ?? 0,
      kind: classifyAttachment(mime, name),
      durationSec: a.duration ? Math.round(a.duration / 1000) : undefined,
    };
    // Размер камеры/галереи иногда неизвестен — тогда проверит сервер.
    const problem = draft.size > 0 ? validateAttachment(draft) : null;
    if (problem) error = problem;
    else items.push(draft);
  });
  return { items, error };
}

/** Снять фото или видео на камеру. */
export async function pickFromCamera(): Promise<PickResult> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    return { items: [], error: 'Нет доступа к камере. Разрешите его в настройках телефона.' };
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.8,
  });
  return res.canceled ? EMPTY : fromImageAssets(res.assets);
}

/** Выбрать несколько фото и видео из галереи. */
export async function pickFromGallery(limit = MAX_ALBUM_ITEMS): Promise<PickResult> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 0.8,
  });
  return res.canceled ? EMPTY : fromImageAssets(res.assets);
}

/** Выбрать любые файлы (документы, аудио). */
export async function pickFiles(): Promise<PickResult> {
  const res = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: '*/*',
  });
  if (res.canceled) return EMPTY;
  const items: AttachmentDraft[] = [];
  let error: string | null = null;
  for (const a of res.assets) {
    const name = safeFileName(a.name, 'file');
    const mime = a.mimeType ?? 'application/octet-stream';
    const draft: AttachmentDraft = {
      uri: a.uri,
      name,
      mimeType: mime,
      size: a.size ?? 0,
      kind: classifyAttachment(mime, name),
    };
    const problem = draft.size > 0 ? validateAttachment(draft) : null;
    if (problem) error = problem;
    else items.push(draft);
  }
  return { items, error };
}
