import { resolveSmsRuntimeConfig } from './smsSettingsService';

const SMS_RU_API_BASE = 'https://sms.ru/sms/send';

function normalizePhone(phone: string): string {
  return String(phone || '').replace(/\D+/g, '');
}

export async function sendPasswordResetCodeSms(phone: string, message: string): Promise<void> {
  const cfg = await resolveSmsRuntimeConfig();
  if (!cfg.enabled) {
    throw new Error('SMS integration is disabled');
  }
  const apiId = String(cfg.apiId || '').trim();
  if (!apiId) {
    throw new Error('SMS provider is not configured');
  }
  const phoneDigits = normalizePhone(phone);
  if (phoneDigits.length < 7) {
    throw new Error('Invalid phone number');
  }

  const params = new URLSearchParams();
  params.set('api_id', apiId);
  params.set('to', phoneDigits);
  params.set('msg', message);
  params.set('json', '1');

  const from = String(cfg.senderName || '').trim();
  if (from) params.set('from', from);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(SMS_RU_API_BASE, {
      method: 'POST',
      body: params,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`SMS gateway HTTP ${response.status}`);
    }
    const json = (await response.json()) as {
      status?: string;
      status_code?: number;
      sms?: Record<string, { status?: string; status_code?: number; status_text?: string }>;
      status_text?: string;
    };
    if (json.status !== 'OK') {
      throw new Error(json.status_text || 'SMS gateway rejected request');
    }
    const smsResult = json.sms?.[phoneDigits];
    if (!smsResult || smsResult.status !== 'OK') {
      throw new Error(smsResult?.status_text || 'Failed to send SMS');
    }
  } finally {
    clearTimeout(timeout);
  }
}
