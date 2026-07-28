import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.puffmanager.app',
  appName: 'Puff Manager Pro',
  webDir: 'dist',

  // ── iOS / Android Server ────────────────────────────────────────────────
  server: {
    // https scheme: obbligatorio per localStorage, cookies e fetch in contesto sicuro
    iosScheme: 'https',
    androidScheme: 'https',
    // Permette la navigazione solo all'interno dell'app
    allowNavigation: [],
  },

  // ── Plugin Capacitor ────────────────────────────────────────────────────
  plugins: {
    // Status bar: dark content su sfondo trasparente
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0d1117',
      overlaysWebView: false,
    },

    // Splash screen (se aggiungi @capacitor/splash-screen in futuro)
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#0d1117',
      showSpinner: false,
      androidSpinnerStyle: 'small',
      iosSpinnerStyle: 'small',
      spinnerColor: '#00bcd4',
      launchAutoHide: true,
    },

    // Keyboard: non ridimensionare il body quando appare la tastiera su iOS
    // (evita layout shift nelle pagine con form)
    Keyboard: {
      resize: 'none',
      style: 'dark',
      resizeOnFullScreen: false,
    },
  },

  // ── iOS specifico ────────────────────────────────────────────────────────
  ios: {
    // Colore di sfondo del native container — corrisponde a surface-950
    backgroundColor: '#0d1117',
    // Disabilita swipe-back gesture (opzionale — riabilitare se l'UX lo richiede)
    // allowsLinkPreview: false,
    // contentInset aggiustato automaticamente per safe area (notch, Dynamic Island)
    contentInset: 'automatic',
    // Scroll elastico nativo abilitato
    scrollEnabled: true,
    // Limita la larghezza minima del contenuto per evitare zoom accidentale
    // minimumFontScale: 1.0,
  },
};

export default config;
