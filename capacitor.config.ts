import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.srtuniversalschool.portal",
  appName: "SRT Universal School",
  webDir: "www",
  server: {
    url: "https://main.d3bt7u4517jg0f.amplifyapp.com",
    cleartext: false,
    allowNavigation: [
      "main.d3bt7u4517jg0f.amplifyapp.com",
      "*.amplifyapp.com",
      "nipoportal.vercel.app",
      "*.vercel.app",
      "accounts.google.com",
      "*.google.com",
      "*.googleusercontent.com"
    ]
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2200,
      launchAutoHide: true,
      backgroundColor: "#060a28",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false
    },
    StatusBar: {
      backgroundColor: "#060a28",
      style: "DARK"
    }
  }
};

export default config;

