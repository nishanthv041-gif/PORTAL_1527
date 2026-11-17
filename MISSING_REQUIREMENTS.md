# SRT PORTAL – REMAINING CREDENTIALS & MANUAL SETUP CHECKLIST

This document lists all remaining external credentials, cloud environment variables, and platform certificates required for final production distribution to the Google Play Store and Apple App Store.

---

## 1. Cloud & Server Environment Variables

### 1.1 OneSignal REST API Key (Required for Server Push API)
- **Status:** Empty placeholder in `.env`.
- **Where to obtain:**
  1. Log into your [OneSignal Dashboard](https://dashboard.onesignal.com).
  2. Select your App: **SRT Portal** (App ID: `721f0fa5-683c-4edc-93ce-35a8786d655b`).
  3. Go to **Settings -> Keys & IDs**.
  4. Copy the **REST API Key**.
- **Where to configure:**
  1. Open [AWS Amplify Console](https://console.aws.amazon.com/amplify).
  2. Select your app: `d3bt7u4517jg0f`.
  3. Go to **App settings -> Environment variables**.
  4. Add `ONESIGNAL_REST_API_KEY` = `<your_key>`.
  5. Trigger a **Redeploy** on the `main` branch.

---

## 2. Android Native Build Requirements

### 2.1 Firebase Cloud Messaging (`google-services.json`)
- **Status:** Missing (Build succeeds without it, but native FCM requires it if not relying solely on OneSignal).
- **Where to obtain:**
  1. Open [Firebase Console](https://console.firebase.google.com).
  2. Under Project Settings, add an Android app with package: `com.srtportal.app`.
  3. Download `google-services.json`.
- **Where to place:**
  ```
  android\app\google-services.json
  ```

### 2.2 Release Keystore Signing Key
- **Status:** Required before uploading `.aab` to Google Play Console.
- **How to generate in PowerShell:**
  ```powershell
  keytool -genkey -v -keystore srt-portal-release.keystore -alias srtportal -keyalg RSA -keysize 2048 -validity 10000
  ```

---

## 3. iOS Native Build Requirements

### 3.1 Apple Developer Account
- **Status:** Required for building on a physical iPhone and distributing to TestFlight.
- **Requirements:**
  1. Active Apple Developer Program enrollment ($99/year).
  2. Xcode 15/16 installed on a Mac running macOS Sonoma or Sequoia.
  3. In Xcode -> Preferences -> Accounts, sign in with your Apple ID.

### 3.2 APNs Push Notification Key / Certificate
- **Status:** Required for Apple Push Notification service.
- **Where to configure:**
  1. In [Apple Developer Member Center](https://developer.apple.com), create an **APNs Key** (`.p8` file).
  2. In your OneSignal Dashboard (or Firebase Console), upload the `.p8` key with your Team ID and Key ID.
  3. OneSignal automatically routes all iOS notifications to Apple's APNs gateways.

### 3.3 Optional: Firebase iOS Configuration (`GoogleService-Info.plist`)
- **Where to place:**
  ```
  ios/App/App/GoogleService-Info.plist
  ```
