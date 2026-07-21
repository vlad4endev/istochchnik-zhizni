export type { ChatMessage, ChatRole } from './types';
export type { AiPromptScopeId } from '../types/aiPromptScopes';
export { AI_PROMPT_SCOPE_LIST } from '../types/aiPromptScopes';
export { AiAgentError, chatCompletion, type ChatCompletionOptions, type AiAgentErrorCode } from './llmClient';
export {
  gptunnelAssistantChat,
  gptunnelChatIdFromConversation,
  isGptunnelBaseUrl,
} from './gptunnelAssistantClient';
export { resolveEffectiveSystemPrompt, resolveLlmRuntimeConfig } from '../services/aiSettingsService';
