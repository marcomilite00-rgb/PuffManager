import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.puffmanager.app',
  appName: 'Puff Manager Pro',
  webDir: 'dist',

  server: {
    iosScheme: 'https',
    androidScheme: 'https',
  },

  ios: {
    contentInset: 'always',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
    allowsLinkPreview: false,
    minimumZoomScale: 1.0,
    maximumZoomScale: 1.0,
  },
};

export default config;
