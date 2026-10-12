import { createPrivateKey, createSign, randomUUID } from 'crypto';
import * as http2 from 'http2';

type ApnsConfig = {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKeyPem: string;
  production: boolean;
};

function loadApnsConfig(): ApnsConfig | null {
  const keyId = (process.env.APNS_KEY_ID ?? '').trim();
  const teamId = (process.env.APNS_TEAM_ID ?? '').trim();
  const bundleId = (process.env.APNS_BUNDLE_ID ?? 'com.istochnikzhizni.molitva').trim();
  const privateKeyPem = (process.env.APNS_P8_KEY ?? '').trim().replace(/\\n/g, '\n');
  if (!keyId || !teamId || !privateKeyPem) return null;
  const production =
    String(process.env.APNS_PRODUCTION ?? process.env.NODE_ENV === 'production').toLowerCase() ===
      'true' || process.env.APNS_PRODUCTION === '1';
  return { keyId, teamId, bundleId, privateKeyPem, production };
}

let cachedJwt: { token: string; exp: number } | null = null;

function getApnsJwt(cfg: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.exp > now + 60) return cachedJwt.token;

  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: cfg.keyId })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: cfg.teamId, iat: now })).toString('base64url');
  const data = `${header}.${payload}`;
  const key = createPrivateKey(cfg.privateKeyPem);
  const sign = createSign('SHA256');
  sign.update(data);
  sign.end();
  const sig = sign.sign(key).toString('base64url');
  const token = `${data}.${sig}`;
  cachedJwt = { token, exp: now + 3500 };
  return token;
}

export function isApnsVoipConfigured(): boolean {
  return loadApnsConfig() != null;
}

export type VoipPushPayload = {
  callId: string;
  callerName: string;
  callerAvatar?: string | null;
  callType: 'audio' | 'video';
  conversationId?: string;
  callerId?: string;
  url: string;
};

/**
 * Отправляет PushKit VoIP push через APNs HTTP/2.
 * Требует APNS_KEY_ID, APNS_TEAM_ID, APNS_P8_KEY (+ опционально APNS_BUNDLE_ID, APNS_PRODUCTION).
 */
export async function sendApnsVoipPush(
  deviceToken: string,
  payload: VoipPushPayload,
  ttlSec: number,
): Promise<'sent' | 'invalid' | 'failed' | 'skipped'> {
  const cfg = loadApnsConfig();
  if (!cfg) return 'skipped';

  const host = cfg.production ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
  const tokenHex = deviceToken.replace(/\s+/g, '').toLowerCase();
  if (!/^[0-9a-f]{64,}$/.test(tokenHex)) {
    return 'invalid';
  }

  const body = JSON.stringify({
    aps: {
      alert: {
        title: payload.callType === 'video' ? 'Входящий видеозвонок' : 'Входящий звонок',
        body: payload.callerName,
      },
    },
    type: 'incoming_call',
    callId: payload.callId,
    callerName: payload.callerName,
    callerAvatar: payload.callerAvatar ?? '',
    callType: payload.callType,
    conversationId: payload.conversationId ?? '',
    callerId: payload.callerId ?? '',
    url: payload.url,
  });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: 'sent' | 'invalid' | 'failed' | 'skipped') => {
      if (settled) return;
      settled = true;
      resolve(v);
    };

    try {
      const client = http2.connect(`https://${host}`);
      client.on('error', () => finish('failed'));

      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${tokenHex}`,
        authorization: `bearer ${getApnsJwt(cfg)}`,
        'apns-topic': `${cfg.bundleId}.voip`,
        'apns-push-type': 'voip',
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + Math.max(15, ttlSec)),
        'apns-id': randomUUID(),
        'content-type': 'application/json',
      });

      let status = 0;
      let respBody = '';
      req.on('response', (headers) => {
        status = Number(headers[':status'] ?? 0);
      });
      req.on('data', (chunk) => {
        respBody += chunk;
      });
      req.on('end', () => {
        client.close();
        if (status === 200) {
          finish('sent');
          return;
        }
        if (status === 410 || /BadDeviceToken|Unregistered/i.test(respBody)) {
          finish('invalid');
          return;
        }
        console.warn('[apns-voip] send failed', { status, respBody: respBody.slice(0, 200) });
        finish('failed');
      });
      req.on('error', () => {
        client.close();
        finish('failed');
      });
      req.end(body);
    } catch (e) {
      console.warn('[apns-voip] request error', e instanceof Error ? e.message : e);
      finish('failed');
    }
  });
}
