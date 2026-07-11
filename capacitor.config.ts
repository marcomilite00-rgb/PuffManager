import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.puffmanager.app',
  appName: 'Puff Manager Pro',
  webDir: 'dist',
  server: {
    // Use https scheme for iOS WebView — required for localStorage, cookies,
    // and any fetch/API calls that expect a secure context
    iosScheme: 'https',
    androidScheme: 'https',
  },
};

export default config;
