const fs = require('fs');
const path = require('path');

/** @type {import('expo/config').ExpoConfig} */
const appJson = require('./app.json').expo;

const googleServicesPath = path.join(__dirname, 'google-services.json');
const hasGoogleServices = fs.existsSync(googleServicesPath);

const android = {
  ...appJson.android,
};

if (hasGoogleServices) {
  android.googleServicesFile = './google-services.json';
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
