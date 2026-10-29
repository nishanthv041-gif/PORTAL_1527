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
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=1280,1050"]
  });

  try {
    const page = await browser.newPage();

    console.log("Setting desktop viewport (1280x1050)...");
    await page.setViewport({ width: 1280, height: 1050, isMobile: false });

    await page.setCookie({
      name: "next-auth.session-token",
      value: TEACHER_TOKEN,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });

    console.log("Navigating to teacher report cards...");
    await page.goto("http://localhost:3005/dashboard/teacher/report-cards", { waitUntil: "networkidle2", timeout: 20000 });

    // Switch to "AI Document & OCR Studio" tab
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('button, div[role="tab"]'));
      const studioTab = tabs.find(t => t.textContent?.includes("AI Document") || t.textContent?.includes("OCR"));
      if (studioTab) (studioTab as HTMLElement).click();
    });

    await new Promise(r => setTimeout(r, 1000));

    // Upload sample file (KIRITHIK M & RAJESWARI M marksheet)
    const sampleImagePath = path.join(ARTIFACT_DIR, ".user_uploaded", "media_1793196769031_7c9682eb.png");
    if (fs.existsSync(sampleImagePath)) {
      console.log("Found sample image at:", sampleImagePath);
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        console.log("Uploading sample image...");
        await fileInput.uploadFile(sampleImagePath);

        console.log("Waiting for extraction response...");
        await page.waitForResponse(
          res => (res.url().includes("/api/report-cards/extract") || res.url().includes("/api/teacher/report-cards/scan")),
          { timeout: 25000 }
        ).catch(e => console.warn("Wait response notice:", e.message));

        await new Promise(r => setTimeout(r, 4000));
      }
    }

    // Scroll window down to display the editor (students list, marks table, calculation badges)
    await page.evaluate(() => {
      window.scrollTo(0, 920);
    });

    await new Promise(r => setTimeout(r, 1000));

    const desktopPath = path.join(ARTIFACT_DIR, "report_cards_ocr_desktop_1280px.png");
    await page.screenshot({ path: desktopPath, fullPage: false });
    console.log("Saved desktop screenshot to:", desktopPath);

    // 2. Mobile 390px view of Teacher Report Cards OCR Studio
    console.log("Setting mobile viewport (390x844)...");
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('button, div[role="tab"]'));
      const studioTab = tabs.find(t => t.textContent?.includes("AI Document") || t.textContent?.includes("OCR"));
      if (studioTab) (studioTab as HTMLElement).click();
    });

    await new Promise(r => setTimeout(r, 600));

    await page.evaluate(() => {
      const editorHeading = Array.from(document.querySelectorAll('h2, h3, h4, div')).find(el => el.textContent?.includes("Data Review & Error Correction Editor"));
      if (editorHeading) {
        editorHeading.scrollIntoView({ behavior: "instant", block: "start" });
      } else {
        window.scrollTo(0, 1650);
      }
    });

    await new Promise(r => setTimeout(r, 800));

    const mobilePath = path.join(ARTIFACT_DIR, "report_cards_ocr_mobile_390px.png");
    await page.screenshot({ path: mobilePath, fullPage: false });
    console.log("Saved mobile screenshot to:", mobilePath);

    // 3. Mobile 390px view of Parent Dashboard (another role) to prove no layout regressions
    console.log("Switching to parent user for parent dashboard verification...");
    await page.deleteCookie({ name: "next-auth.session-token", domain: "localhost" });
    await page.setCookie({
      name: "next-auth.session-token",
      value: PARENT_TOKEN,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    });

    await page.goto("http://localhost:3005/dashboard/parent", { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise(r => setTimeout(r, 1000));

    const parentMobilePath = path.join(ARTIFACT_DIR, "dashboard_parent_mobile_390px.png");
    await page.screenshot({ path: parentMobilePath, fullPage: false });
    console.log("Saved parent mobile screenshot to:", parentMobilePath);

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error("Puppeteer script failed:", err);
  process.exit(1);
});
