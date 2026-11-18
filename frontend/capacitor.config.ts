import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.llevalo.app',
  appName: 'Llévalo',
  webDir: 'dist',
  server: {
    url: 'https://llevalo.vercel.app',
    cleartext: true
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#FDFBF7'
    }
  }
};

export default config;