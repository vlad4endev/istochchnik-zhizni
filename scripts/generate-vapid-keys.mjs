import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
const subject = 'mailto:admin@example.com';

console.log('Generated VAPID keys:\n');
console.log(`Public Key : ${keys.publicKey}`);
console.log(`Private Key: ${keys.privateKey}`);
console.log('\nAdd this block to your backend .env:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=${subject}`);
console.log('\nTip: replace VAPID_SUBJECT with your real support email.');
