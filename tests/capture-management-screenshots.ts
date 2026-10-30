import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";
import { encode } from "next-auth/jwt";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\rpnis\\.gemini\\antigravity\\brain\\9250ed6d-7ffe-4bb0-b102-1615a42115fa";
const BASE_URL = "http://localhost:3008";

const envText = fs.readFileSync(".env", "utf-8");
const secretMatch = envText.match(/NEXTAUTH_SECRET=["']?([^"'\r\n]+)/);
const secret = secretMatch ? secretMatch[1] : "default-secret";

async function makeToken(user: { id: string; email: string; role: string; name?: string }) {
  return await encode({
    token: {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name || "Administrator",
      role: user.role,
      sessionVersion: 1
    },
    secret
  });
}

async function capture() {
  console.log("=== CAPTURING MANAGEMENT SCREENSHOTS ===");
  const adminToken = await makeToken({
    id: "cmvhopn4d0000hoqpb6xcb2io",
    email: "jpranav116@gmail.com",
    role: "ADMIN",
    name: "Administrator"
  });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"]
  });

  try {
    // ----------------------------------------------------
    // 1. ADMIN SETTINGS - Desktop & Mobile
    // ----------------------------------------------------
    console.log("Capturing 1. Admin Settings Desktop (1280px)...");
    const settingsDesktop = await browser.newPage();
    await settingsDesktop.setViewport({ width: 1280, height: 950, isMobile: false });
    await settingsDesktop.setCookie({
      name: "next-auth.session-token",
      value: adminToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });
    await settingsDesktop.goto(`${BASE_URL}/dashboard/admin/settings`, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise(r => setTimeout(r, 1000));
    await settingsDesktop.screenshot({ path: path.join(ARTIFACT_DIR, "admin_settings_desktop_1280px.png"), fullPage: false });
    await settingsDesktop.close();

    console.log("Capturing 1. Admin Settings Mobile (390px)...");
    const settingsMobile = await browser.newPage();
    await settingsMobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await settingsMobile.setCookie({
      name: "next-auth.session-token",
      value: adminToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });
    await settingsMobile.goto(`${BASE_URL}/dashboard/admin/settings`, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise(r => setTimeout(r, 1000));
    await settingsMobile.screenshot({ path: path.join(ARTIFACT_DIR, "admin_settings_mobile_390px.png"), fullPage: false });
    await settingsMobile.close();

    // ----------------------------------------------------
    // 2. TEACHER MANAGEMENT GRID - Desktop & Mobile
    // ----------------------------------------------------
    console.log("Capturing 2. Teacher Management Desktop (1280px)...");
    const teachersDesktop = await browser.newPage();
    await teachersDesktop.setViewport({ width: 1280, height: 950, isMobile: false });
    await teachersDesktop.setCookie({
      name: "next-auth.session-token",
      value: adminToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });
    await teachersDesktop.goto(`${BASE_URL}/dashboard/admin/teachers`, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise(r => setTimeout(r, 1000));
    await teachersDesktop.screenshot({ path: path.join(ARTIFACT_DIR, "teacher_management_desktop_1280px.png"), fullPage: false });

    // Open Edit Teacher Drawer
    console.log("Capturing 3. Teacher Edit Drawer Desktop (1280px)...");
    await teachersDesktop.evaluate(() => {
      const editBtns = Array.from(document.querySelectorAll("button")).filter(b => b.textContent?.includes("Edit Profile"));
      if (editBtns[0]) (editBtns[0] as HTMLElement).click();
    });
    await new Promise(r => setTimeout(r, 800));
    await teachersDesktop.screenshot({ path: path.join(ARTIFACT_DIR, "teacher_edit_drawer_desktop_1280px.png"), fullPage: false });
    await teachersDesktop.close();

    console.log("Capturing 2. Teacher Management Mobile (390px)...");
    const teachersMobile = await browser.newPage();
    await teachersMobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await teachersMobile.setCookie({
      name: "next-auth.session-token",
      value: adminToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });
    await teachersMobile.goto(`${BASE_URL}/dashboard/admin/teachers`, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise(r => setTimeout(r, 1000));
    await teachersMobile.screenshot({ path: path.join(ARTIFACT_DIR, "teacher_management_mobile_390px.png"), fullPage: false });

    // Open Edit Drawer on Mobile
    console.log("Capturing 3. Teacher Edit Drawer Mobile (390px)...");
    await teachersMobile.evaluate(() => {
      const editBtns = Array.from(document.querySelectorAll("button")).filter(b => b.textContent?.includes("Edit Profile"));
      if (editBtns[0]) (editBtns[0] as HTMLElement).click();
    });
    await new Promise(r => setTimeout(r, 800));
    await teachersMobile.screenshot({ path: path.join(ARTIFACT_DIR, "teacher_edit_drawer_mobile_390px.png"), fullPage: false });
    await teachersMobile.close();

    // ----------------------------------------------------
    // 3. PARENT & STUDENT MANAGEMENT - Desktop & Mobile
    // ----------------------------------------------------
    console.log("Capturing 4. Classes Overview & Student List Desktop (1280px)...");
    const studentsDesktop = await browser.newPage();
    await studentsDesktop.setViewport({ width: 1280, height: 950, isMobile: false });
    await studentsDesktop.setCookie({
      name: "next-auth.session-token",
      value: adminToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });
    await studentsDesktop.goto(`${BASE_URL}/dashboard/admin/students`, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise(r => setTimeout(r, 1000));
    await studentsDesktop.screenshot({ path: path.join(ARTIFACT_DIR, "classes_overview_desktop_1280px.png"), fullPage: false });

    // Click first class to filter roster
    console.log("Capturing 5. Class Student Roster Desktop (1280px)...");
    await studentsDesktop.evaluate(() => {
      const classCards = Array.from(document.querySelectorAll("div")).filter(d => d.textContent?.includes("Class 1 - A"));
      if (classCards[0]) (classCards[0] as HTMLElement).click();
    });
    await new Promise(r => setTimeout(r, 600));
    await studentsDesktop.screenshot({ path: path.join(ARTIFACT_DIR, "class_students_roster_desktop_1280px.png"), fullPage: false });

    // Open Edit Student Drawer & switch to Login & Access tab
    console.log("Capturing 6. Student Edit Drawer Login & Access Desktop (1280px)...");
    await studentsDesktop.evaluate(() => {
      const editBtns = Array.from(document.querySelectorAll("button")).filter(b => b.textContent === "Edit");
      if (editBtns[0]) (editBtns[0] as HTMLElement).click();
    });
    await new Promise(r => setTimeout(r, 600));
    await studentsDesktop.evaluate(() => {
      const accessTab = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes("Login & Access"));
      if (accessTab) (accessTab as HTMLElement).click();
    });
    await new Promise(r => setTimeout(r, 600));
    await studentsDesktop.screenshot({ path: path.join(ARTIFACT_DIR, "student_edit_drawer_desktop_1280px.png"), fullPage: false });
    await studentsDesktop.close();

    console.log("Capturing 4. Classes Overview Mobile (390px)...");
    const studentsMobile = await browser.newPage();
    await studentsMobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await studentsMobile.setCookie({
      name: "next-auth.session-token",
      value: adminToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });
    await studentsMobile.goto(`${BASE_URL}/dashboard/admin/students`, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise(r => setTimeout(r, 1000));
    await studentsMobile.screenshot({ path: path.join(ARTIFACT_DIR, "classes_overview_mobile_390px.png"), fullPage: false });

    // Click class on mobile
    console.log("Capturing 5. Class Student Roster Mobile (390px)...");
    await studentsMobile.evaluate(() => {
      const classCards = Array.from(document.querySelectorAll("div")).filter(d => d.textContent?.includes("Class 1 - A"));
      if (classCards[0]) (classCards[0] as HTMLElement).click();
    });
    await new Promise(r => setTimeout(r, 600));
    await studentsMobile.screenshot({ path: path.join(ARTIFACT_DIR, "class_students_roster_mobile_390px.png"), fullPage: false });

    // Open Edit Drawer on Mobile
    console.log("Capturing 6. Student Edit Drawer Mobile (390px)...");
    await studentsMobile.evaluate(() => {
      const editBtns = Array.from(document.querySelectorAll("button")).filter(b => b.textContent === "Edit");
      if (editBtns[0]) (editBtns[0] as HTMLElement).click();
    });
    await new Promise(r => setTimeout(r, 600));
    await studentsMobile.evaluate(() => {
      const accessTab = Array.from(document.querySelectorAll("button")).find(b => b.textContent?.includes("Login & Access"));
      if (accessTab) (accessTab as HTMLElement).click();
    });
    await new Promise(r => setTimeout(r, 600));
    await studentsMobile.screenshot({ path: path.join(ARTIFACT_DIR, "student_edit_drawer_mobile_390px.png"), fullPage: false });
    await studentsMobile.close();

    console.log("ALL 12 MANAGEMENT SCREENSHOTS CAPTURED SUCCESSFULLY!");
  } finally {
    await browser.close();
  }
}

capture().catch(console.error);
