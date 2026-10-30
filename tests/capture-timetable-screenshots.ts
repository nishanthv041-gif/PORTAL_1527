import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";
import { encode } from "next-auth/jwt";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\rpnis\\.gemini\\antigravity\\brain\\9250ed6d-7ffe-4bb0-b102-1615a42115fa";
const BASE_URL = "http://localhost:3008";

// Extract secret from .env
const envText = fs.readFileSync(".env", "utf-8");
const secretMatch = envText.match(/NEXTAUTH_SECRET=["']?([^"'\r\n]+)/);
const secret = secretMatch ? secretMatch[1] : "default-secret";

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

async function capture() {
  console.log("=== CAPTURING TIMETABLE SYSTEM SCREENSHOTS ===");
  const adminToken = await makeToken({ id: 'cmvhopn4d0000hoqpb6xcb2io', email: 'jpranav116@gmail.com', role: 'ADMIN', name: 'Administrator' });
  const teacherToken = await makeToken({ id: 'cmvpbrmjf0005vjqbt1bhy3if', email: 'mounithavenkatesan@gmail.com', role: 'TEACHER', name: 'Mounitha' });
  const parentToken = await makeToken({ id: 'cmvpf17u3000w61b82548p55n', email: 'rajeswarim.ee25@bitsathy.ac.in', role: 'PARENT', name: 'Rajeswari' });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1280,1050"]
  });

  try {
    // 1. ADMIN TIMETABLE - Desktop 1280px
    console.log("1. Capturing Admin Timetable Desktop (1280px)...");
    const pageDesktop = await browser.newPage();
    await pageDesktop.setViewport({ width: 1280, height: 950, isMobile: false });
    await pageDesktop.setCookie({
      name: "next-auth.session-token",
      value: adminToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });
    await pageDesktop.goto(`${BASE_URL}/dashboard/admin/timetable`, { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 1500));
    const adminDesktopPath = path.join(ARTIFACT_DIR, "admin_timetable_desktop_1280px.png");
    await pageDesktop.screenshot({ path: adminDesktopPath, fullPage: false });
    console.log("   Saved:", adminDesktopPath);

    // 2. TIMETABLE IMPORT MODAL - Desktop 1280px
    console.log("2. Capturing Import/Scan Modal Desktop (1280px)...");
    await pageDesktop.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const scanBtn = btns.find(b => b.textContent?.includes("Upload & Scan Timetable") || b.textContent?.includes("Scan File"));
      if (scanBtn) (scanBtn as HTMLElement).click();
    });
    await new Promise(r => setTimeout(r, 1200));
    const importModalPath = path.join(ARTIFACT_DIR, "timetable_import_modal_desktop_1280px.png");
    await pageDesktop.screenshot({ path: importModalPath, fullPage: false });
    console.log("   Saved:", importModalPath);
    await pageDesktop.close();

    // 3. ADMIN TIMETABLE - Mobile 390px
    console.log("3. Capturing Admin Timetable Mobile (390px)...");
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
    await pageMobile.goto(`${BASE_URL}/dashboard/admin/timetable`, { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 1500));
    const adminMobilePath = path.join(ARTIFACT_DIR, "admin_timetable_mobile_390px.png");
    await pageMobile.screenshot({ path: adminMobilePath, fullPage: false });
    console.log("   Saved:", adminMobilePath);

    // 4. TIMETABLE IMPORT MODAL - Mobile 390px
    console.log("4. Capturing Import Modal Mobile (390px)...");
    await pageMobile.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const scanBtn = btns.find(b => b.textContent?.includes("Upload & Scan Timetable") || b.textContent?.includes("Scan File"));
      if (scanBtn) (scanBtn as HTMLElement).click();
    });
    await new Promise(r => setTimeout(r, 1200));
    const importModalMobilePath = path.join(ARTIFACT_DIR, "timetable_import_modal_mobile_390px.png");
    await pageMobile.screenshot({ path: importModalMobilePath, fullPage: false });
    console.log("   Saved:", importModalMobilePath);
    await pageMobile.close();

    // 5. SUBSTITUTION PAGE - Desktop 1280px
    console.log("5. Capturing Substitution Page Desktop (1280px)...");
    const subDesktop = await browser.newPage();
    await subDesktop.setViewport({ width: 1280, height: 950, isMobile: false });
    await subDesktop.setCookie({
      name: "next-auth.session-token",
      value: adminToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });
    await subDesktop.goto(`${BASE_URL}/dashboard/admin/timetable/substitution`, { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 1500));
    const subDesktopPath = path.join(ARTIFACT_DIR, "timetable_substitution_desktop_1280px.png");
    await subDesktop.screenshot({ path: subDesktopPath, fullPage: false });
    console.log("   Saved:", subDesktopPath);
    await subDesktop.close();

    // 6. SUBSTITUTION PAGE - Mobile 390px
    console.log("6. Capturing Substitution Page Mobile (390px)...");
    const subMobile = await browser.newPage();
    await subMobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await subMobile.setCookie({
      name: "next-auth.session-token",
      value: adminToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });
    await subMobile.goto(`${BASE_URL}/dashboard/admin/timetable/substitution`, { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 1500));
    const subMobilePath = path.join(ARTIFACT_DIR, "timetable_substitution_mobile_390px.png");
    await subMobile.screenshot({ path: subMobilePath, fullPage: false });
    console.log("   Saved:", subMobilePath);
    await subMobile.close();

    // 7. TEACHER TODAY SCHEDULE - Desktop 1280px
    console.log("7. Capturing Teacher Today Schedule Desktop (1280px)...");
    const teacherDesktop = await browser.newPage();
    await teacherDesktop.setViewport({ width: 1280, height: 950, isMobile: false });
    await teacherDesktop.setCookie({
      name: "next-auth.session-token",
      value: teacherToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });
    await teacherDesktop.goto(`${BASE_URL}/dashboard/teacher`, { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 1500));
    const teacherDesktopPath = path.join(ARTIFACT_DIR, "teacher_today_schedule_desktop_1280px.png");
    await teacherDesktop.screenshot({ path: teacherDesktopPath, fullPage: false });
    console.log("   Saved:", teacherDesktopPath);
    await teacherDesktop.close();

    // 8. TEACHER TODAY SCHEDULE - Mobile 390px
    console.log("8. Capturing Teacher Today Schedule Mobile (390px)...");
    const teacherMobile = await browser.newPage();
    await teacherMobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await teacherMobile.setCookie({
      name: "next-auth.session-token",
      value: teacherToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });
    await teacherMobile.goto(`${BASE_URL}/dashboard/teacher`, { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 1500));
    const teacherMobilePath = path.join(ARTIFACT_DIR, "teacher_today_schedule_mobile_390px.png");
    await teacherMobile.screenshot({ path: teacherMobilePath, fullPage: false });
    console.log("   Saved:", teacherMobilePath);
    await teacherMobile.close();

    // 9. PARENT DASHBOARD TIMETABLE - Desktop 1280px
    console.log("9. Capturing Parent Dashboard Timetable Desktop (1280px)...");
    const parentDesktop = await browser.newPage();
    await parentDesktop.setViewport({ width: 1280, height: 950, isMobile: false });
    await parentDesktop.setCookie({
      name: "next-auth.session-token",
      value: parentToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });
    await parentDesktop.goto(`${BASE_URL}/dashboard/parent`, { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 1500));
    const parentDesktopPath = path.join(ARTIFACT_DIR, "parent_dashboard_timetable_desktop_1280px.png");
    await parentDesktop.screenshot({ path: parentDesktopPath, fullPage: false });
    console.log("   Saved:", parentDesktopPath);
    await parentDesktop.close();

    // 10. PARENT DASHBOARD TIMETABLE - Mobile 390px
    console.log("10. Capturing Parent Dashboard Timetable Mobile (390px)...");
    const parentMobile = await browser.newPage();
    await parentMobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await parentMobile.setCookie({
      name: "next-auth.session-token",
      value: parentToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });
    await parentMobile.goto(`${BASE_URL}/dashboard/parent`, { waitUntil: "networkidle2", timeout: 25000 });
    await new Promise(r => setTimeout(r, 1500));
    const parentMobilePath = path.join(ARTIFACT_DIR, "parent_dashboard_timetable_mobile_390px.png");
    await parentMobile.screenshot({ path: parentMobilePath, fullPage: false });
    console.log("   Saved:", parentMobilePath);
    await parentMobile.close();

    console.log("\n=======================================================");
    console.log("🎉 ALL SCREENSHOTS CAPTURED SUCCESSFULLY AT 390px & 1280px! 🎉");
    console.log("=======================================================");
  } finally {
    await browser.close();
  }
}

capture().catch(err => {
  console.error("Capture failure:", err);
  process.exit(1);
});
