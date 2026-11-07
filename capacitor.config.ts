import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.a2delites.dairytracker',
  appName: 'A2D Elites',
  webDir: 'build',
  android: {
    useLegacyBridge: true
  }
};

export default config;
