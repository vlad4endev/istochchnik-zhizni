import assert from 'node:assert/strict';
import { resolveModelForSection, type ResolvedLlmConfig } from '../services/aiSettingsService';
import {
  buildSectionModelsAdminView,
  normalizeAiSettingsDocument,
} from './aiSettings';

function baseResolved(over: Partial<ResolvedLlmConfig> = {}): ResolvedLlmConfig {
  return {
    enabled: true,
    base_url: 'https://api.openai.com/v1',
    api_key: 'sk-test',
    default_model: 'gpt-4o-mini',
    system_prompt: null,
    section_prompts: {},
    section_models: {},
    temperature: 0.7,
    max_tokens: 2048,
    gptunnel_assistant_code: null,
    ...over,
  };
}

function run(): void {
  const doc = normalizeAiSettingsDocument({
    enabled: true,
    default_model: 'gpt-4o',
    section_models: {
      messenger: 'gpt-4o-mini',
      songbook: '  openai/gpt-4o  ',
      unknown_scope: 'should-drop',
      studio: '',
    },
  });
  assert.equal(doc.section_models.messenger, 'gpt-4o-mini');
  assert.equal(doc.section_models.songbook, 'openai/gpt-4o');
  assert.equal(doc.section_models.studio, undefined);
  assert.equal((doc.section_models as Record<string, string>).unknown_scope, undefined);

  const view = buildSectionModelsAdminView(
    normalizeAiSettingsDocument({
      section_models: { calendar: 'deepseek-chat' },
    }),
  );
  assert.equal(view.calendar, 'deepseek-chat');
  assert.equal(view.messenger, null);
  assert.equal(view.songbook, null);

  const cfg = baseResolved({
    default_model: 'gpt-4o-mini',
    section_models: { studio: 'deepseek-reasoner' },
  });
  assert.equal(resolveModelForSection(cfg, 'studio'), 'deepseek-reasoner');
  assert.equal(resolveModelForSection(cfg, 'messenger'), 'gpt-4o-mini');
  assert.equal(resolveModelForSection(cfg, undefined), 'gpt-4o-mini');
  assert.equal(resolveModelForSection(cfg, 'not-a-scope'), 'gpt-4o-mini');

  console.log('aiSettings.test.ts: OK');
}

run();
