
import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\rpnis\\.gemini\\antigravity\\brain\\9250ed6d-7ffe-4bb0-b102-1615a42115fa";

const TEACHER_TOKEN = "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..mNQ4QWN0_2GkSXgA.QzXlcbmQaXvAtRvUgc7Ja5C-s0GmXwHHndMc-r8sHgPumKAZmJDqugEWD1GUmpDBJJZ8LaU1_mAjQu1Yd2fXok0DmcT6YcGKOpda314wtZ5udyqEjUpwQDosuNgeKKQ5qyBmOW_pp1trjg0urUg5U9IqzoFFWCft9KMyLf5vK6PQupke-MoBHcX0GmhxAsPkT3cgmOOQ9XdvDn8BHYS4Gizymu0_ShABlHIXd0ewqMj8JXxTIgWlwoj7ye0PPih200U0ZfimEpZ_yaybQ8bOj8loucFD2U4w0cCO.Rh5626EPWV_XnpGaqSpA9A";
const PARENT_TOKEN = "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..zTfQA0FbXEz2R6r2.twfMgmH_rrAKl1rrAyS_GEpTILqpWMxLCe2pXXD7RyH3Z7o5Pbqtcb5qQk09j9eKgTy01KPF4Cpw3nCtjyc6B0qZ5kQsn_CwahqMWyOXX0tP0wJuSHhsU9G4MV34f-kEYzFj8NjZE43-FaaEFUNJ9p-5OzKr23xqVE7p4UeL6X0szBw9XsrbVfqNiVnwj6ULviv1x-bp_pwrUHDdhRlzlV74L9almpyRckCL5-zmxziYXxUu2hcnDQuuIDhOeIOSYZresbndQmFXvMESMGHZwqJfb4xcCmgHRFcc2WFjtNi-3cWwIf4.omeV-PNyNE_EgnnHGdjrYg";

async function main() {
  console.log("Launching Chrome...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"]
  });

  try {
    const sampleImagePath = path.join(ARTIFACT_DIR, ".user_uploaded", "media_1793196769031_7c9682eb.png");

    // ==========================================
    // 1. DESKTOP VIEW (1280x1050)
    // ==========================================
    console.log("Capturing Desktop 1280px view...");
    const desktopPage = await browser.newPage();
    await desktopPage.setViewport({ width: 1280, height: 1050, isMobile: false });
    await desktopPage.setCookie({
      name: "next-auth.session-token",
      value: TEACHER_TOKEN,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });

    await desktopPage.goto("http://localhost:3005/dashboard/teacher/report-cards", { waitUntil: "networkidle2", timeout: 20000 });

    // Switch to OCR Studio tab
    await desktopPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const studioBtn = btns.find(b => b.textContent?.includes("AI Document & OCR Studio") || b.textContent?.includes("OCR Studio"));
      if (studioBtn) (studioBtn as HTMLElement).click();
    });

    await new Promise(r => setTimeout(r, 1000));

    // Upload sample marksheet
    if (fs.existsSync(sampleImagePath)) {
      const fileInput = await desktopPage.$('input[type="file"]');
      if (fileInput) {
        await fileInput.uploadFile(sampleImagePath);
        await desktopPage.waitForResponse(
          res => res.url().includes("/api/report-cards/extract") || res.url().includes("/api/teacher/report-cards/scan"),
          { timeout: 25000 }
        ).catch(() => { });
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // Scroll to editor
    await desktopPage.evaluate(() => {
      window.scrollTo(0, 920);
    });
    await new Promise(r => setTimeout(r, 800));

    const desktopPath = path.join(ARTIFACT_DIR, "report_cards_ocr_desktop_1280px.png");
    await desktopPage.screenshot({ path: desktopPath });
    console.log("Saved desktop screenshot to:", desktopPath);
    await desktopPage.close();

    // ==========================================
    // 2. MOBILE VIEW (390x844)
    // ==========================================
    console.log("Capturing Mobile 390px view with filled marks...");
    const mobilePage = await browser.newPage();
    await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await mobilePage.setCookie({
      name: "next-auth.session-token",
      value: TEACHER_TOKEN,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });

    await mobilePage.goto("http://localhost:3005/dashboard/teacher/report-cards", { waitUntil: "networkidle2", timeout: 20000 });

    // Switch to OCR Studio tab
    await mobilePage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const studioBtn = btns.find(b => b.textContent?.includes("AI Document & OCR Studio") || b.textContent?.includes("OCR Studio"));
      if (studioBtn) (studioBtn as HTMLElement).click();
    });

    await new Promise(r => setTimeout(r, 1000));

    // Upload sample marksheet on mobile
    if (fs.existsSync(sampleImagePath)) {
      const fileInput = await mobilePage.$('input[type="file"]');
      if (fileInput) {
        await fileInput.uploadFile(sampleImagePath);
        await mobilePage.waitForResponse(
          res => res.url().includes("/api/report-cards/extract") || res.url().includes("/api/teacher/report-cards/scan"),
          { timeout: 25000 }
        ).catch(() => { });
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // Scroll to the mobile marks cards section showing auto-filled marks
    await mobilePage.evaluate(() => {
      const cards = document.querySelector('[class*="mobileCardsView"]');
      if (cards) {
        cards.scrollIntoView({ behavior: "instant", block: "start" });
      } else {
        window.scrollTo(0, 1100);
      }
    });

    await new Promise(r => setTimeout(r, 1000));

    const mobilePath = path.join(ARTIFACT_DIR, "report_cards_ocr_mobile_390px.png");
    await mobilePage.screenshot({ path: mobilePath });
    console.log("Saved mobile screenshot to:", mobilePath);
    await mobilePage.close();

    // ==========================================
    // 3. PARENT DASHBOARD VERIFICATION (390px)
    // ==========================================
    console.log("Switching to parent user for parent dashboard verification...");
    const parentPage = await browser.newPage();
    await parentPage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await parentPage.setCookie({
      name: "next-auth.session-token",
      value: PARENT_TOKEN,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });

    await parentPage.goto("http://localhost:3005/dashboard/parent", { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise(r => setTimeout(r, 1000));

    const parentMobilePath = path.join(ARTIFACT_DIR, "dashboard_parent_mobile_390px.png");
    await parentPage.screenshot({ path: parentMobilePath });
    console.log("Saved parent mobile screenshot to:", parentMobilePath);
    await parentPage.close();

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error("Screenshot capture error:", err);
  process.exit(1);
});
