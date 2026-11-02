-- Раньше прихожанин (parishioner) неявно получал доступ к разделу, если туда
-- был допущен «член церкви» (member) — даже если администратор явно снял
-- галочку «Прихожанин» в настройках видимости разделов. Это поведение убрано
-- из кода (src/types/sectionVisibilitySettings.ts, web-react/mobile canRoleAccessSection).
--
-- Чтобы не менять задним числом уже настроенный на сервере доступ для старых
-- записей (сохранённых до появления роли parishioner либо до исправления),
-- один раз донастраиваем сохранённый section_visibility_json: добавляем
-- parishioner туда, где уже разрешён member, но parishioner ещё не указан явно.
UPDATE public.global_settings AS gs
SET section_visibility_json = COALESCE(
  (
    SELECT (jsonb_build_object('sections', agg))::text
    FROM (
      SELECT jsonb_object_agg(section_key, patched) AS agg
      FROM (
        SELECT
          section_key,
          CASE
            WHEN (section_value -> 'roles') ? 'member'
              AND NOT ((section_value -> 'roles') ? 'parishioner')
            THEN jsonb_set(
              section_value,
              '{roles}',
              (section_value -> 'roles') || to_jsonb('parishioner'::text)
            )
            ELSE section_value
          END AS patched
        FROM jsonb_each(gs.section_visibility_json::jsonb -> 'sections') AS t(section_key, section_value)
      ) AS inner_patched
    ) AS agg_wrap
    -- agg приходит NULL, если у «sections» нет ключей — тогда берём исходное
    -- значение через COALESCE, а не затираем его буквальным JSON null.
    WHERE agg IS NOT NULL
  ),
  gs.section_visibility_json
)
WHERE gs.id = 1
  AND gs.section_visibility_json IS NOT NULL
  AND btrim(gs.section_visibility_json) <> ''
  AND jsonb_typeof(gs.section_visibility_json::jsonb -> 'sections') = 'object';
