import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";
import { encode } from "next-auth/jwt";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\rpnis\\.gemini\\antigravity\\brain\\9250ed6d-7ffe-4bb0-b102-1615a42115fa";
const BASE_URL = "http://localhost:3008";

let secret = "default-secret";
if (fs.existsSync(".env.local")) {
  const envLocal = fs.readFileSync(".env.local", "utf-8");
  const m = envLocal.match(/NEXTAUTH_SECRET=["']?([^"'\r\n]+)/);
  if (m) secret = m[1];
}
if (secret === "default-secret" && fs.existsSync(".env")) {
  const envText = fs.readFileSync(".env", "utf-8");
  const m = envText.match(/NEXTAUTH_SECRET=["']?([^"'\r\n]+)/);
  if (m) secret = m[1];
}

async function makeToken(user: { id: string; email: string; role: string; name?: string }) {
  return await encode({
    token: {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name || "Test User",
      role: user.role
    },
    secret
  });
}

async function runVerification() {
  console.log("=== CAPTURING CONFIRM DIALOGS & VERIFYING SUBJECT DROPDOWN ===");
  const adminToken = await makeToken({
    id: "cmvhopn4d0000hoqpb6xcb2io",
    email: "jpranav116@gmail.com",
    role: "ADMIN",
    name: "Administrator"
  });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1280,1050"]
  });

  try {
    const pageDesktop = await browser.newPage();
    await pageDesktop.setViewport({ width: 1280, height: 900, isMobile: false });
    await pageDesktop.setCookie({
      name: "next-auth.session-token",
      value: adminToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });

    // -------------------------------------------------------------
    // PART 1: DESKTOP 1280px - PRIMARY CONFIRM DIALOG (Publish All)
    // -------------------------------------------------------------
    console.log("1. Desktop (1280px): Testing Primary Confirm Dialog (Publish All)...");
    await pageDesktop.goto(`${BASE_URL}/dashboard/admin/timetable`, { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 1200));

    const clickedPublish = await pageDesktop.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent?.trim().includes("Publish All"));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (clickedPublish) {
      await new Promise(r => setTimeout(r, 600));
      const dialog = await pageDesktop.$('div[role="alertdialog"]');
      if (dialog) {
        console.log("   ✔ Primary ConfirmDialog opened successfully!");
        const title = await pageDesktop.$eval('#confirm-dialog-title', el => el.textContent);
        const msg = await pageDesktop.$eval('#confirm-dialog-description', el => el.textContent);
        console.log(`     Title: "${title}"`);
        console.log(`     Message: "${msg}"`);

        const desktopPrimaryPath = path.join(ARTIFACT_DIR, "confirm_dialog_primary_desktop_1280px.png");
        await pageDesktop.screenshot({ path: desktopPrimaryPath });
        console.log("   ✔ Saved primary desktop screenshot:", desktopPrimaryPath);

        // Cancel dialog
        await pageDesktop.evaluate(() => {
          const dialog = document.querySelector('div[role="alertdialog"]');
          const cancelBtn = dialog?.querySelector('button') as HTMLButtonElement | null;
          cancelBtn?.click();
        });
        await new Promise(r => setTimeout(r, 400));
      }
    }

    // -------------------------------------------------------------
    // PART 2: DESKTOP 1280px - DANGER CONFIRM DIALOG (Clear Timetable)
    // -------------------------------------------------------------
    console.log("2. Desktop (1280px): Testing Danger Confirm Dialog (Clear Timetable)...");
    const clickedClear = await pageDesktop.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.title?.includes("Clear all slots") || b.title?.includes("Clear"));
      if (btn && !(btn as any).disabled) {
        btn.click();
        return true;
      }
      return false;
    });

    if (clickedClear) {
      await new Promise(r => setTimeout(r, 600));
      const dangerDialog = await pageDesktop.$('div[role="alertdialog"]');
      if (dangerDialog) {
        console.log("   ✔ Danger ConfirmDialog opened successfully!");
        const title = await pageDesktop.$eval('#confirm-dialog-title', el => el.textContent);
        const msg = await pageDesktop.$eval('#confirm-dialog-description', el => el.textContent);
        console.log(`     Title: "${title}"`);
        console.log(`     Message: "${msg}"`);

        const desktopDangerPath = path.join(ARTIFACT_DIR, "confirm_dialog_danger_desktop_1280px.png");
        await pageDesktop.screenshot({ path: desktopDangerPath });
        console.log("   ✔ Saved danger desktop screenshot:", desktopDangerPath);

        await pageDesktop.evaluate(() => {
          const dialog = document.querySelector('div[role="alertdialog"]');
          const cancelBtn = dialog?.querySelector('button') as HTMLButtonElement | null;
          cancelBtn?.click();
        });
        await new Promise(r => setTimeout(r, 400));
      }
    }

    // -------------------------------------------------------------
    // PART 3: MOBILE 390px - CONFIRM DIALOG (Sidebar Logout)
    // -------------------------------------------------------------
    console.log("3. Mobile (390px): Testing Dialog on iPhone screen (Sidebar Logout)...");
    const pageMobile = await browser.newPage();
    await pageMobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await pageMobile.setCookie({
      name: "next-auth.session-token",
      value: adminToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });

    await pageMobile.goto(`${BASE_URL}/dashboard/admin`, { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 1200));

    const clickedLogout = await pageMobile.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => b.textContent?.includes("Logout"));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (clickedLogout) {
      await new Promise(r => setTimeout(r, 600));
      const mobileDialog = await pageMobile.$('div[role="alertdialog"]');
      if (mobileDialog) {
        console.log("   ✔ Mobile ConfirmDialog opened successfully!");
        const title = await pageMobile.$eval('#confirm-dialog-title', el => el.textContent);
        const msg = await pageMobile.$eval('#confirm-dialog-description', el => el.textContent);
        console.log(`     Title: "${title}"`);
        console.log(`     Message: "${msg}"`);

        const mobileDialogPath = path.join(ARTIFACT_DIR, "confirm_dialog_mobile_390px.png");
        await pageMobile.screenshot({ path: mobileDialogPath });
        console.log("   ✔ Saved mobile dialog screenshot:", mobileDialogPath);

        await pageMobile.evaluate(() => {
          const dialog = document.querySelector('div[role="alertdialog"]');
          const cancelBtn = dialog?.querySelector('button') as HTMLButtonElement | null;
          cancelBtn?.click();
        });
        await new Promise(r => setTimeout(r, 400));
      }
    }

    // -------------------------------------------------------------
    // PART 4: SUBJECT DROPDOWN OPTIONS VERIFICATION IN TIMETABLE
    // -------------------------------------------------------------
    console.log("4. Verifying Subject Dropdown inside Cell Editor...");
    await pageDesktop.goto(`${BASE_URL}/dashboard/admin/timetable`, { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 1500));

    const clickedAdd = await pageDesktop.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const plusBtn = buttons.find(b => b.textContent?.trim() === "+" && b.title?.includes("Add")) ||
                      buttons.find(b => b.textContent?.trim() === "+");
      if (plusBtn) {
        plusBtn.click();
        return true;
      }
      return false;
    });

    if (clickedAdd) {
      await new Promise(r => setTimeout(r, 600));

      const subjectOptions = await pageDesktop.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (const sel of selects) {
          const opts = Array.from(sel.options).map(o => o.textContent?.trim());
          if (opts.some(o => o?.includes("Select Subject"))) {
            return opts;
          }
        }
        return [];
      });

      console.log("   Dropdown subject options found:", subjectOptions);
      const dropdownVerifiedPath = path.join(ARTIFACT_DIR, "subject_dropdown_verified.png");
      await pageDesktop.screenshot({ path: dropdownVerifiedPath });
      console.log("   ✔ Saved subject dropdown screenshot:", dropdownVerifiedPath);
    }

  } catch (err) {
    console.error("Verification error:", err);
  } finally {
    await browser.close();
  }
}

runVerification();
