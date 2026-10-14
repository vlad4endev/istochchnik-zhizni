import {useEffect, useState} from 'react';
import {Alert, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {Button} from '../../components/ui/Button';
import {Loading} from '../../components/ui/Loading';
import {Screen} from '../../components/ui/Screen';
import {TextField} from '../../components/ui/TextField';
import {songRepository} from '../../repositories/SongRepository';
import type {RootStackParamList} from '../../app/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SongEdit'>;

function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `song-${Date.now()}`;
}

export function SongEditScreen({route, navigation}: Props) {
  const songId = route.params?.songId;
  const isCreate = !songId;
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState('');
  const [defaultKey, setDefaultKey] = useState('');
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!songId) return;
    void (async () => {
      setLoading(true);
      const song = await songRepository.getById(songId);
      if (song) {
        setTitle(song.title);
        setSlug(song.slug);
        setContent(song.content);
        setDefaultKey(song.default_key ?? '');
      }
      setLoading(false);
    })();
  }, [songId]);

  const onSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert('Название', 'Введите название песни');
      return;
    }
    setSaving(true);
    try {
      if (isCreate) {
        const created = await songRepository.create({
          title: trimmed,
          slug: slug.trim() || slugify(trimmed),
          content,
          default_key: defaultKey.trim() || null,
        });
        navigation.replace('SongDetail', {songId: created.id});
      } else if (songId) {
        await songRepository.update(songId, {
          title: trimmed,
          slug: slug.trim() || slugify(trimmed),
          content,
          default_key: defaultKey.trim() || null,
        });
        navigation.goBack();
      }
    } catch (e) {
      Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View className="gap-4">
        <Text className="text-2xl font-bold text-stone-900">
          {isCreate ? 'Новая песня' : 'Редактирование'}
        </Text>
        <Text className="text-sm text-stone-500">
          Сохраняется в локальную SQLite и уходит в очередь синхронизации с сервером.
        </Text>
        <TextField
          value={title}
          onChangeText={text => {
            setTitle(text);
            if (isCreate && !slug) setSlug(slugify(text));
          }}
          placeholder="Название"
        />
        <TextField value={slug} onChangeText={setSlug} placeholder="Slug" autoCapitalize="none" />
        <TextField
          value={defaultKey}
          onChangeText={setDefaultKey}
          placeholder="Тональность (например G)"
          autoCapitalize="characters"
        />
        <TextField
          value={content}
          onChangeText={setContent}
          placeholder="Текст / аккорды"
          multiline
          style={{minHeight: 180, textAlignVertical: 'top'}}
        />
        <Button title={saving ? 'Сохранение…' : 'Сохранить'} onPress={onSave} disabled={saving} />
        <Button title="Отмена" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </Screen>
  );
}
