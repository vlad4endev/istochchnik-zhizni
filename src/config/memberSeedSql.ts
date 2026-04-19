/**
 * Идемпотентная вставка базового списка участников.
 * Учитывает ту же семантику, что findMemberIdConflictingName: «Фамилия Имя» в сиде
 * не дублирует карточку с first_name/last_name и name «Имя Фамилия».
 */
export const MEMBER_SEED_SQL = `
WITH source_members(full_name) AS (
  VALUES
    ('Беспалова Татьяна'),
    ('Бизюков Никита'),
    ('Герасимова Алла Ивановна'),
    ('Горбань Андрей'),
    ('Горбань София'),
    ('Грек Борис'),
    ('Грек Вячеслав'),
    ('Грек Тая'),
    ('Грек Ян'),
    ('Гришин Алексей'),
    ('Гришина Ангелина'),
    ('Дудкин Владимир'),
    ('Дудкин Марина'),
    ('Жигунов Александр'),
    ('Жигунов Андрей'),
    ('Жигунов Дмитрий'),
    ('Жигунова Людмила'),
    ('Жигунова Наталья'),
    ('Жупикова Елена'),
    ('Камышин Николай'),
    ('Камышина Светлана'),
    ('Каштанова Татьяна'),
    ('Киселева Нина'),
    ('Корчагин Алексей'),
    ('Корчагина Дарья'),
    ('Корчагина Любовь'),
    ('Латышева Елена'),
    ('Латышева Людмила'),
    ('Малютин Юрий'),
    ('Малютина Елена'),
    ('Малютина Ирина'),
    ('Нестерова Полина'),
    ('Неупокоев Владимир'),
    ('Неупокоева Любовь'),
    ('Плотников Евгений'),
    ('Плотникова Элина'),
    ('Пыльдмаа Екатерина'),
    ('Резяпкина Любовь'),
    ('Самодуров Михаил'),
    ('Сорокин Дмитрий'),
    ('Сорокина Мария'),
    ('Степанова Светлана'),
    ('Толстошеин Эдуард'),
    ('Толстошеина Ирина'),
    ('Толстошеина Марина'),
    ('Харлашкин Александр'),
    ('Харлашкина Инна'),
    ('Харлашкина Лина'),
    ('Чендев Влад'),
    ('Чендева Наталья'),
    ('Чибисова Нина'),
    ('Шкирская Надежда'),
    ('Шкирский Геннадий'),
    ('Юрьева Надежда')
),
src AS (
  SELECT
    full_name,
    regexp_split_to_array(trim(full_name), '[[:space:]]+') AS words
  FROM source_members
)
INSERT INTO members (name, prayer_request, in_prayer_cycle)
SELECT s.full_name, NULL, TRUE
FROM src s
WHERE NOT EXISTS (
  SELECT 1
  FROM members m
  WHERE
    lower(regexp_replace(trim(coalesce(m.name, '')), '[[:space:]]+', ' ', 'g'))
      = lower(regexp_replace(trim(s.full_name), '[[:space:]]+', ' ', 'g'))
    OR (
      cardinality(s.words) = 2
      AND (
        (
          nullif(trim(coalesce(m.first_name, '')), '') IS NOT NULL
          AND nullif(trim(coalesce(m.last_name, '')), '') IS NOT NULL
          AND lower(trim(m.first_name)) = lower(s.words[2])
          AND lower(trim(m.last_name)) = lower(s.words[1])
        )
        OR (
          nullif(trim(coalesce(m.first_name, '')), '') IS NULL
          AND nullif(trim(coalesce(m.last_name, '')), '') IS NULL
          AND lower(regexp_replace(trim(coalesce(m.name, '')), '[[:space:]]+', ' ', 'g')) IN (
            lower(regexp_replace(trim(s.full_name), '[[:space:]]+', ' ', 'g')),
            lower(regexp_replace(trim(s.words[2] || ' ' || s.words[1]), '[[:space:]]+', ' ', 'g'))
          )
        )
      )
    )
    OR (
      cardinality(s.words) >= 3
      AND (
        (
          nullif(trim(coalesce(m.first_name, '')), '') IS NOT NULL
          AND nullif(trim(coalesce(m.last_name, '')), '') IS NOT NULL
          AND lower(trim(m.first_name)) = lower(
            array_to_string(s.words[2:array_length(s.words, 1)], ' ')
          )
          AND lower(trim(m.last_name)) = lower(s.words[1])
        )
        OR (
          nullif(trim(coalesce(m.first_name, '')), '') IS NULL
          AND nullif(trim(coalesce(m.last_name, '')), '') IS NULL
          AND lower(regexp_replace(trim(coalesce(m.name, '')), '[[:space:]]+', ' ', 'g')) IN (
            lower(regexp_replace(trim(s.full_name), '[[:space:]]+', ' ', 'g')),
            lower(regexp_replace(trim(
              array_to_string(s.words[2:array_length(s.words, 1)], ' ') || ' ' || s.words[1]
            ), '[[:space:]]+', ' ', 'g')),
            lower(regexp_replace(trim(
              s.words[1] || ' ' || array_to_string(s.words[2:array_length(s.words, 1)], ' ')
            ), '[[:space:]]+', ' ', 'g'))
          )
        )
      )
    )
);
`;
