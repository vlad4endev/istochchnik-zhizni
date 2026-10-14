#!/usr/bin/env node
/**
 * Static push readiness check for the Capacitor Android release APK.
 * Does not send a real FCM message (needs a physical device + Firebase Admin).
 *
 * Usage:
 *   node scripts/verify-android-push.mjs [path/to/app-release.apk]
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const apk =
  process.argv[2] ||
  path.join(root, 'android/app/build/outputs/apk/release/app-release.apk');

const aaptCandidates = [
  process.env.AAPT,
  path.join(process.env.ANDROID_HOME || '', 'build-tools/35.0.0/aapt'),
  path.join(process.env.HOME || '', 'android-sdk/build-tools/35.0.0/aapt'),
].filter(Boolean);

function findAapt() {
  for (const c of aaptCandidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

if (!existsSync(apk)) {
  fail(`APK not found: ${apk}`);
  process.exit(1);
}

const aapt = findAapt();
if (!aapt) {
  fail('aapt not found (set ANDROID_HOME or AAPT)');
  process.exit(1);
}

const badging = spawnSync(aapt, ['dump', 'badging', apk], { encoding: 'utf8' });
if (badging.status !== 0) {
  fail(`aapt badging failed: ${badging.stderr || badging.stdout}`);
  process.exit(1);
}

const pkg = /package: name='([^']+)'/.exec(badging.stdout)?.[1];
const ver = /versionName='([^']+)'/.exec(badging.stdout)?.[1];
if (pkg !== 'com.istochnikzhizni.molitva') {
  fail(`unexpected package: ${pkg}`);
} else {
  ok(`package ${pkg} (${ver})`);
}

const gsPath = path.join(root, 'android/app/google-services.json');
if (!existsSync(gsPath)) {
  fail('android/app/google-services.json missing');
} else {
  ok('google-services.json present');
}

const resources = spawnSync(aapt, ['dump', 'resources', apk], { encoding: 'utf8' });
const resOut = resources.stdout || '';
for (const key of ['google_app_id', 'gcm_defaultSenderId', 'project_id']) {
  if (resOut.includes(`string/${key}`)) ok(`resource ${key}`);
  else fail(`missing resource ${key}`);
}

const strings = spawnSync(aapt, ['dump', 'strings', apk], { encoding: 'utf8' });
const sOut = strings.stdout || '';
if (sOut.includes('mychurch-29bce')) ok('Firebase project_id embedded');
else fail('Firebase project_id not found in APK strings');
if (sOut.includes('1:93057601077:android:dd3cc9999ce518472a2b7c')) ok('google_app_id embedded');
else fail('google_app_id not found in APK strings');

const unzip = spawnSync('unzip', ['-l', apk], { encoding: 'utf8' });
const listing = unzip.stdout || '';
if (listing.includes('classes')) ok('dex present');
else fail('no classes*.dex in APK');

const stringsDex = spawnSync(
  'bash',
  [
    '-lc',
    `tmpdir=$(mktemp -d) && unzip -qq "${apk}" 'classes*.dex' -d "$tmpdir" && strings "$tmpdir"/classes*.dex | rg -i 'AppFirebaseMessagingService|PushNotificationsPlugin|MESSAGING_EVENT' | head -20; rm -rf "$tmpdir"`,
  ],
  { encoding: 'utf8' },
);
const dexHits = stringsDex.stdout || '';
if (dexHits.includes('AppFirebaseMessagingService')) ok('AppFirebaseMessagingService in dex');
else fail('AppFirebaseMessagingService missing from dex');
if (dexHits.includes('PushNotificationsPlugin')) ok('PushNotificationsPlugin in dex');
else fail('PushNotificationsPlugin missing from dex');

const pluginsPath = path.join(root, 'android/app/src/main/assets/capacitor.plugins.json');
if (existsSync(pluginsPath)) {
  const plugins = JSON.parse(readFileSync(pluginsPath, 'utf8'));
  const push = plugins.find((p) => p.pkg === '@capacitor/push-notifications');
  if (push) ok(`Capacitor plugin registered: ${push.classpath}`);
  else fail('@capacitor/push-notifications not in capacitor.plugins.json');
} else {
  fail('capacitor.plugins.json missing from assets');
}

const assetsPublic = path.join(root, 'android/app/src/main/assets/public/assets');
const jsCheck = spawnSync(
  'bash',
  [
    '-lc',
    `rg -l 'save-token|PushNotifications' "${assetsPublic}"/*.js 2>/dev/null | head -3`,
  ],
  { encoding: 'utf8' },
);
if ((jsCheck.stdout || '').trim()) ok('web bundle contains FCM save-token / PushNotifications');
else fail('web bundle missing FCM client code');

const manifest = path.join(
  root,
  'android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml',
);
if (existsSync(manifest)) {
  const xml = readFileSync(manifest, 'utf8');
  if (xml.includes('POST_NOTIFICATIONS')) ok('POST_NOTIFICATIONS permission');
  else fail('POST_NOTIFICATIONS missing');
  if (xml.includes('AppFirebaseMessagingService')) ok('FCM service in merged manifest');
  else fail('AppFirebaseMessagingService missing from merged manifest');
  if (xml.includes('com.capacitorjs.plugins.pushnotifications.MessagingService')) {
    fail('Capacitor MessagingService still in manifest (should be tools:node=remove)');
  } else {
    ok('duplicate Capacitor MessagingService removed');
  }
} else {
  console.warn('WARN: merged manifest not found (build intermediates cleaned?) — skipped');
}

if (process.exitCode) {
  console.error('\nPush static verification FAILED');
  process.exit(1);
}
console.log('\nPush static verification PASSED');
console.log('Device check still required: login → allow notifications → toast «Push-уведомления подключены» → send test message.');
