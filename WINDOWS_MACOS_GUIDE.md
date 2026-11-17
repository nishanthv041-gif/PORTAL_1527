# SRT PORTAL – WINDOWS & MACOS DESKTOP DEPLOYMENT GUIDE

**Portal Domain:** `https://main.d3bt7u4517jg0f.amplifyapp.com`  
**Application Name:** SRT Universal School Portal  

---

## 1. Important Architecture Note: Capacitor vs. Desktop Platforms

> [!IMPORTANT]
> Capacitor is designed specifically for **Android** and **iOS** mobile platforms. Capacitor does **not** directly compile or bundle native Windows `.exe` / `.msi` or macOS `.app` / `.dmg` desktop executables.
>
> For Windows and macOS desktop environments, there are two primary architectures:
> 1. **Production Progressive Web App (PWA) [Recommended & Active]**: Zero-overhead installation directly via Microsoft Edge, Google Chrome, or Apple Safari.
> 2. **Desktop Container (Electron or Tauri) [Optional Alternative]**: If school IT departments require strict enterprise MSI / DMG installers with local offline runtime.

---

## 2. Option 1: Desktop PWA Installation (Zero Setup, Auto-Updating)

The portal is already 100% configured for desktop installation.

### Windows 10 & 11 (Microsoft Edge or Google Chrome):
1. Open `https://main.d3bt7u4517jg0f.amplifyapp.com` in **Microsoft Edge** or **Google Chrome**.
2. Look at the right side of the address bar for the **"App available. Install SRT Portal"** icon (or click the three dots `...` -> **Apps** -> **Install this site as an app**).
3. Click **Install**.
4. The SRT Portal opens in a clean, standalone, borderless window with its own taskbar icon and Start Menu entry.
5. In Windows Settings -> System -> Notifications, allow notifications for "SRT Portal" to receive lock-screen banner alerts.

### macOS (Safari 17+ or Google Chrome):
1. Open `https://main.d3bt7u4517jg0f.amplifyapp.com` in **Apple Safari**.
2. Click **File -> Add to Dock...** in the top menu bar.
3. Confirm name: **SRT Portal** and click **Add**.
4. The SRT Portal icon appears in the macOS Dock and Launchpad.
5. Runs as an isolated macOS desktop app with macOS Notification Center alerts and Dock unread count badges.

---

## 3. Option 2: Evaluation of Electron vs. Tauri for Standalone Installers

If school administrative regulations strictly mandate an offline installer file:

| Evaluation Factor | Desktop PWA (Current) | Electron Wrapper | Tauri Container |
| :--- | :---: | :---: | :---: |
| **Installer Type** | Instant (Browser) | `.exe` / `.msi` / `.dmg` | `.msi` / `.exe` / `.dmg` |
| **Binary Download Size** | 0 MB (Cached in browser) | ~85 MB – 140 MB | ~10 MB – 25 MB |
| **RAM Usage** | Low (Shared browser engine) | Medium-High (Dedicated Chromium) | Very Low (System WebKit/WebView2) |
| **Lock-Screen Push Alerts** | Native OS Web Push | WebSockets or Electron Push | WebSockets or System Notifications |
| **Auto-Updates** | Instant (AWS Amplify CI/CD) | Requires electron-updater / code signing | Requires tauri-updater |
| **Production Recommendation** | **Tier 1 (Recommended)** | Tier 3 (Heavy) | Tier 2 (Viable alternative) |

### Recommended Conclusion for School Portal:
For 1,500 simultaneous school users across varying hardware (laptops, school office PCs, MacBooks, tablets), the **Desktop PWA** provides the highest performance, instant bug fixes via AWS Amplify continuous deployment, native Windows 11/macOS notification integration, and requires zero client software installation or IT administration overhead.
