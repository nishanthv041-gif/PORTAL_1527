import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.srtportal.app",
  appName: "SRT Portal",
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
      "*.googleusercontent.com",
      "*.onesignal.com",
      "cdn.onesignal.com"
    ]
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: process.env.NODE_ENV !== "production"
  },
  ios: {
    contentInset: "always",
    preferredContentMode: "mobile"
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: "#000000",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false
    },
    StatusBar: {
      backgroundColor: "#000000",
      style: "DARK"
    }
  }
};

export default config;
