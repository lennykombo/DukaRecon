const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withBgActions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return config;

    app.service = app.service || [];

    const serviceName =
      'com.asterinet.react.bgactions.RNBackgroundActionsTask';

    const existing = app.service.find(
      (s) => s.$['android:name'] === serviceName
    );

    if (existing) {
      existing.$['android:foregroundServiceType'] = 'dataSync';
    } else {
      app.service.push({
        $: {
          'android:name': serviceName,
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'dataSync',
        },
      });
    }

    return config;
  });
};
