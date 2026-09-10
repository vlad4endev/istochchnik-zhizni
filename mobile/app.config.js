const fs = require('fs');
const path = require('path');

/** @type {import('expo/config').ExpoConfig} */
const appJson = require('./app.json').expo;

/**
 * Local file (gitignored) or EAS Environment Variable type=file
 * named GOOGLE_SERVICES_JSON (path injected at build time).
 */
function resolveGoogleServicesFile() {
  const fromEas = (process.env.GOOGLE_SERVICES_JSON || '').trim();
  if (fromEas && fs.existsSync(fromEas)) {
    return fromEas;
  }
  const local = path.join(__dirname, 'google-services.json');
  if (fs.existsSync(local)) {
    return './google-services.json';
  }
  return null;
}

const googleServicesFile = resolveGoogleServicesFile();
const hasGoogleServices = Boolean(googleServicesFile);

const android = {
  ...appJson.android,
};

if (googleServicesFile) {
  android.googleServicesFile = googleServicesFile;
} else {
  delete android.googleServicesFile;
}

module.exports = {
  ...appJson,
  android,
  extra: {
    ...(appJson.extra ?? {}),
    hasGoogleServices,
  },
};
