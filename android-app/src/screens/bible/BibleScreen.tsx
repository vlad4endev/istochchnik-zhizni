import {useQuery} from '@tanstack/react-query';
import {useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, Text, View} from 'react-native';

import {Screen} from '../../components/ui/Screen';
import {apiClient} from '../../shared/apiClient';

type BibleBook = {
  slug: string;
  name: string;
  short_name: string;
  testament: string;
  chapters_count: number;
};

type BibleVerse = {verse: number; text: string};

async function fetchBooks(): Promise<BibleBook[]> {
  const {data} = await apiClient.get<{books: BibleBook[]}>('/api/bible/books', {
    params: {translation: 'synodal'},
  });
  return data.books ?? [];
}

async function fetchChapter(book: string, chapter: number) {
  const {data} = await apiClient.get<{
    book: BibleBook;
    chapter: number;
    verses: BibleVerse[];
  }>(`/api/bible/chapter/synodal/${encodeURIComponent(book)}/${chapter}`);
  return data;
}

export function BibleScreen() {
  const [selected, setSelected] = useState<{book: string; chapter: number} | null>(null);
  const booksQ = useQuery({queryKey: ['bible', 'books'], queryFn: fetchBooks});
  const chapterQ = useQuery({
    queryKey: ['bible', 'chapter', selected?.book, selected?.chapter],
    queryFn: () => fetchChapter(selected!.book, selected!.chapter),
    enabled: Boolean(selected),
  });

  const nt = useMemo(
    () => (booksQ.data ?? []).filter(b => b.testament === 'nt'),
    [booksQ.data],
  );

  if (selected) {
    return (
      <Screen>
        <View className="mb-3 flex-row items-center justify-between">
          <Pressable onPress={() => setSelected(null)}>
            <Text className="text-base font-semibold text-[#7d3640]">← Книги</Text>
          </Pressable>
          <Text className="text-lg font-bold text-stone-900">
            {chapterQ.data?.book.short_name ?? selected.book} {selected.chapter}
          </Text>
          <View className="w-14" />
        </View>
        <ScrollView className="flex-1">
          {chapterQ.isLoading ? <ActivityIndicator color="#7d3640" /> : null}
          {(chapterQ.data?.verses ?? []).map(v => (
            <Text key={v.verse} className="mb-2 text-[17px] leading-7 text-stone-900">
              <Text className="text-xs font-bold text-[#7d3640]">{v.verse} </Text>
              {v.text}
            </Text>
          ))}
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text className="mb-4 text-2xl font-bold text-stone-900">Библия</Text>
      <ScrollView className="flex-1">
        {booksQ.isLoading ? <ActivityIndicator color="#7d3640" /> : null}
        {nt.map(b => (
          <Pressable
            key={b.slug}
            className="mb-2 rounded-2xl border border-stone-200 bg-white px-4 py-3"
            onPress={() => setSelected({book: b.slug, chapter: 1})}>
            <Text className="text-base font-bold text-stone-900">{b.short_name}</Text>
            <Text className="text-sm text-stone-500">{b.name}</Text>
          </Pressable>
        ))}
        {!booksQ.isLoading && (booksQ.data ?? []).length === 0 ? (
          <Text className="text-sm text-stone-500">
            Текст не загружен. На сервере: npm run bible:seed
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
