// This project uses `vite-plugin-pwa`, which generates the real `sw.js` at build time.
// The custom push handlers live in `public/custom-sw.js` and are imported by Workbox (`importScripts`).
//
// Keeping this file here as a readable reference for local/static hosting setups.
importScripts('/custom-sw.js');

