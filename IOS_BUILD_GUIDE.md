# SRT PORTAL – IOS NATIVE APP BUILD & PACKAGING GUIDE

**Application Name:** SRT Portal  
**Bundle Identifier:** `com.srtportal.app`  
**Target Platform:** iOS 14.0+ / iPadOS 14.0+  
**Platform Tooling:** Capacitor 8 + Xcode 15/16 + Swift Package Manager  

---

## 1. Prerequisites (macOS Required)

Building native iOS applications requires macOS with Xcode:
1. **macOS:** macOS Sonoma or macOS Sequoia.
2. **Xcode:** Version 15.0 or newer (downloadable from Mac App Store).
3. **Apple Developer Account:** Required for device signing, APNs push certificate, and TestFlight / App Store submission.
4. **Command Line Tools:** Verify via terminal:
   ```bash
   xcode-select --install
   ```

---

## 2. Syncing Capacitor iOS Platform

From your project directory:

```bash
npx cap sync ios
```

This synchronizes:
- Swift Package Manager dependencies (`Capacitor`, `@capawesome/capacitor-badge`, `@capacitor/push-notifications`, `@capacitor/preferences`).
- Cordova plugins (`onesignal-cordova-plugin`).
- iOS configurations (`Info.plist`, `AppDelegate.swift`, icons, and splash screens).

---

## 3. Opening the Project in Xcode

Open the native Xcode workspace:

```bash
npx cap open ios
```
Or open the folder directly in Finder:
```
ios/App/App.xcodeproj
```

---

## 4. Signing & Capabilities Setup in Xcode

1. Select the top-level **App** project in the Xcode project navigator.
2. Under **Signing & Capabilities**:
   - Check **"Automatically manage signing"**.
   - Select your registered **Apple Development Team**.
   - Verify Bundle Identifier is `com.srtportal.app`.
3. Verify Required Capabilities:
   - Click **+ Capability** and add:
     - **Push Notifications** (enables APNs device token registration).
     - **Background Modes**: Check **Remote notifications** and **Background fetch**.

---

## 5. Building & Deploying to iPhone / iPad

1. Connect your physical iPhone or iPad to your Mac via USB cable.
2. In the Xcode top device selector, choose your connected iPhone/iPad.
3. Click the **Run** button (or press `Cmd + R`).
4. On your iPhone, if prompted:
   - Go to **Settings -> General -> VPN & Device Management**.
   - Trust your Developer Account profile.
   - Launch **SRT Portal**.

---

## 6. Building for TestFlight / App Store Distribution

1. In Xcode, set the build destination to **Any iOS Device (arm64)**.
2. Select **Product -> Archive**.
3. Once the archive finishes, the **Organizer** window opens.
4. Click **Distribute App**:
   - Choose **App Store Connect** (for TestFlight and App Store submission).
   - Follow prompts for automatic signing and upload.
5. In App Store Connect, invite Teachers and Parents to beta test via TestFlight.

---

## 7. Optional: Firebase APNs Integration (`GoogleService-Info.plist`)

If utilizing Firebase Cloud Messaging for iOS:
1. In the [Firebase Console](https://console.firebase.google.com), add an iOS App with Bundle ID: `com.srtportal.app`.
2. Download `GoogleService-Info.plist`.
3. Open the project in Xcode, and drag `GoogleService-Info.plist` into the `App` group (ensure **Copy items if needed** is checked).
4. Run `npx cap sync ios`.
