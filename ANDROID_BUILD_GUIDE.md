# SRT PORTAL – ANDROID NATIVE APP BUILD & PACKAGING GUIDE

**Application Name:** SRT Portal  
**Package Identifier:** `com.srtportal.app`  
**Target SDK:** 34 / 35 (Android 14 / 15)  
**Minimum SDK:** 22 (Android 5.1 Lollipop)  
**Platform Tooling:** Capacitor 8 + Android Gradle Plugin 8.13.0 + JDK 17/21  

---

## 1. Prerequisites on Windows

Ensure the following tools are installed:
1. **Node.js:** v20.x or v22.x LTS.
2. **Android Studio:** Ladybug or newer.
   - Android SDK Platform 34 / 35
   - Android SDK Build-Tools 34.0.0 or 35.0.0
   - Android SDK Command-line Tools
3. **Java Development Kit (JDK):** OpenJDK 17 or 21.
   Verify in PowerShell:
   ```powershell
   java -version
   ```
4. **Environment Variables:**
   - `JAVA_HOME`: Path to JDK (e.g. `C:\Program Files\Eclipse Adoptium\jdk-17...` or Android Studio's bundled `jbr`).
   - `ANDROID_HOME`: Path to Android SDK (e.g. `C:\Users\<user>\AppData\Local\Android\Sdk`).

---

## 2. Syncing Capacitor Assets

Before building, always ensure native configurations and assets are synchronized:

```powershell
npx cap sync android
```

---

## 3. Building Debug APK via CLI (PowerShell)

You can build the debug `.apk` directly without opening the Android Studio GUI:

```powershell
cd android
.\gradlew assembleDebug
cd ..
```

**Output APK Location:**
```
android\app\build\outputs\apk\debug\app-debug.apk
```

To install directly to a connected Android phone or emulator with USB debugging enabled:
```powershell
cd android
.\gradlew installDebug
cd ..
```

---

## 4. Building Production Signed Release APK / AAB

For distribution or uploading to the Google Play Console:

### Step 4.1: Generate a Keystore (One-Time Setup)
Run this command once to generate a release signing key:
```powershell
keytool -genkey -v -keystore srt-portal-release.keystore -alias srtportal -keyalg RSA -keysize 2048 -validity 10000
```
Store `srt-portal-release.keystore` securely.

### Step 4.2: Build Android App Bundle (AAB for Google Play)
```powershell
cd android
.\gradlew bundleRelease
cd ..
```
**Output AAB Location:**
```
android\app\build\outputs\bundle\release\app-release.aab
```

### Step 4.3: Build Standalone Release APK
```powershell
cd android
.\gradlew assembleRelease
cd ..
```
**Output APK Location:**
```
android\app\build\outputs\apk\release\app-release-unsigned.apk
```

---

## 5. Opening Project in Android Studio

If you prefer using the Android Studio IDE:
```powershell
npx cap open android
```
- Wait for Gradle sync to complete.
- Click **Build -> Build Bundle(s) / APK(s) -> Build APK(s)**.
- Or click **Run 'app'** (Green play button) with a device connected.

---

## 6. Optional: Firebase Push Setup (`google-services.json`)

To enable native Firebase Cloud Messaging (FCM):
1. Open the [Firebase Console](https://console.firebase.google.com).
2. Create or open the Firebase Project for **SRT Portal**.
3. Add an Android app with package name: `com.srtportal.app`.
4. Download `google-services.json`.
5. Place the downloaded file directly at:
   ```
   android\app\google-services.json
   ```
6. Run `npx cap sync android`.
