import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.puffmanager.app',
  appName: 'Puff Manager Pro',
  webDir: 'dist',

  server: {
    // https scheme: obbligatorio per localStorage, cookies e fetch in contesto sicuro
    iosScheme: 'https',
    androidScheme: 'https',
  },
};

export default config;
