import { describe, expect, it } from 'vitest';
import {
  hasMessengerSenderId,
  isAssistantBotMessage,
  isServicePlanMondayMailingPayload,
} from '../src/features/messenger/messengerChannelKinds';

describe('hasMessengerSenderId', () => {
  it('treats null/undefined/0 as no sender (system mailing)', () => {
    expect(hasMessengerSenderId(null)).toBe(false);
    expect(hasMessengerSenderId(undefined)).toBe(false);
    expect(hasMessengerSenderId(0)).toBe(false);
  });

  it('accepts positive member ids', () => {
    expect(hasMessengerSenderId(1)).toBe(true);
    expect(hasMessengerSenderId(42)).toBe(true);
  });
});

describe('isServicePlanMondayMailingPayload', () => {
  it('detects monday mailing kind', () => {
    expect(isServicePlanMondayMailingPayload({ kind: 'service_plan_monday_mailing' })).toBe(true);
    expect(isServicePlanMondayMailingPayload({ kind: 'other' })).toBe(false);
    expect(isServicePlanMondayMailingPayload(null)).toBe(false);
  });
});

describe('isAssistantBotMessage', () => {
  it('allows bot detection when sender_id was wrongly coerced to 0', () => {
    expect(isAssistantBotMessage({ assistant: true }, 0)).toBe(true);
    expect(isAssistantBotMessage({ assistant: true }, null)).toBe(true);
    expect(isAssistantBotMessage({ assistant: true }, 12)).toBe(false);
  });
});
