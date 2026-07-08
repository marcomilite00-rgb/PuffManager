import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.puffmanager.app',
  appName: 'Puff Manager Pro',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
