import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.esarwa.warehouse',
  appName: 'Esarwa Warehouse',
  webDir: 'www',
  plugins: {
    Camera: {
      permissions: ['camera']
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#000000',
      overlaysWebView: false,
      android: {
        backgroundColor: '#000000',
        style: 'dark',
        overlaysWebView: false
      }
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#000000',
      showSpinner: false
    }
  },
  android: {
    permissions: [
      'android.permission.CAMERA',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE'
    ],
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true
  },
  ios: {
    permissions: [
      'NSCameraUsageDescription'
    ],
    contentInset: 'automatic'
  }
};

export default config;
