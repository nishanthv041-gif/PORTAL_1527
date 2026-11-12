import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\rpnis\\.gemini\\antigravity\\brain\\9250ed6d-7ffe-4bb0-b102-1615a42115fa";

// Read the actual CSS modules directly from the codebase
const cardCss = fs.readFileSync(
  path.join(process.cwd(), "frontend/components/birthdays/BirthdayWishCard.module.css"),
  "utf8"
);
const modalCss = fs.readFileSync(
  path.join(process.cwd(), "frontend/components/notifications/NotificationPopupModal.module.css"),
  "utf8"
);

// Read Amman photo as base64 to ensure it loads deterministically in offline test harness
const ammanImgBase64 = fs.existsSync(path.join(process.cwd(), "public/assets/birthday/amman.jpg"))
  ? `data:image/jpeg;base64,${fs.readFileSync(path.join(process.cwd(), "public/assets/birthday/amman.jpg")).toString("base64")}`
  : "";

// Read school logo as base64
const logoImgBase64 = fs.existsSync(path.join(process.cwd(), "public/assets/birthday/bit-logo-circle.png"))
  ? `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), "public/assets/birthday/bit-logo-circle.png")).toString("base64")}`
  : (fs.existsSync(path.join(process.cwd(), "public/logo/srt-logo.svg"))
    ? `data:image/svg+xml;base64,${fs.readFileSync(path.join(process.cwd(), "public/logo/srt-logo.svg")).toString("base64")}`
    : "");

// Read signature as base64
const signatureBase64 = fs.existsSync(path.join(process.cwd(), "public/assets/birthday/signature.png"))
  ? `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), "public/assets/birthday/signature.png")).toString("base64")}`
  : "";

function generateHtml(options: {
  recipientName: string;
  missingPhoto?: boolean;
  missingLogo?: boolean;
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Birthday Modal Responsive Test</title>
  <style>
    :root {
      --card-bg: #ffffff;
      --border-color: rgba(226, 232, 240, 0.85);
      --foreground: #0f172a;
      --text-secondary: #475569;
      --text-muted: #64748b;
      --primary: #3b82f6;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0f172a;
    }
    ${modalCss}
    ${cardCss}
  </style>
</head>
<body>
  <div class="overlay" id="test-overlay">
    <div class="modalCard modalCardWide" role="dialog" id="test-modal">
      <!-- 44x44px touch target close button -->
      <button type="button" class="topRightCloseBtn" id="test-close-btn" aria-label="Close dialog">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <!-- Bell badge circle -->
      <div class="bellBadgeCircle">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="bellIcon">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        <span class="counterBadge">1</span>
      </div>

      <!-- Category Pill -->
      <div>
        <span class="categoryPill" style="background-color: rgba(245, 158, 11, 0.16); color: #b45309; border: 1px solid rgba(245, 158, 11, 0.35);">
          <span>🎂 Birthday Wish</span>
        </span>
      </div>

      <!-- Birthday Card Wrapper -->
      <div class="birthdayCardWrapper">
        <div class="cardContainer" id="test-card">
          <!-- 1. Amman photo frame -->
          <div class="photoWrapper" id="elem-photo">
            <div class="photoFrame">
              ${
                !options.missingPhoto && ammanImgBase64
                  ? `<img src="${ammanImgBase64}" alt="Lord Bannari Amman" class="deityImage" id="img-deity" />`
                  : `<div class="deityFallback" id="fallback-deity"><span class="deityFallbackIcon">🕉️</span><strong>Amman</strong></div>`
              }
            </div>
          </div>

          <!-- Content Area -->
          <div class="contentArea" id="elem-content">
            <!-- 2 & 3. Heading & Salutation -->
            <div class="headerSection" id="elem-header">
              <h2 class="headingMain" id="elem-heading">Happy Birthday</h2>
              <div class="salutation" id="elem-salutation">
                My Dear <span class="recipientName" id="elem-recipient">${options.recipientName}</span>
              </div>
            </div>

            <!-- 4. Message Body -->
            <div class="bodySection" id="elem-body">
              <p class="messageLine">I have great pleasure in conveying my best wishes on the eve of your birthday</p>
              <p class="messageLine">My prayers are to Lord Bannari Amman to bless you with peace, prosperity and happiness</p>
            </div>

            <!-- Footer: 5 & 6 Signature, then 7 Logo Badge -->
            <div class="footerSection" id="elem-footer">
              <div class="signatureBlock" id="elem-signature">
                <span class="closing">Yours Sincerely</span>
                ${
                  signatureBase64
                    ? `<div class="signatureGraphicWrapper"><img src="${signatureBase64}" alt="Signature" class="signatureGraphic" /></div>`
                    : ""
                }
                <span class="senderName">S V Balasubramaniam</span>
                <span class="senderDesignation">Chairman</span>
                <span class="schoolAffiliation">Bannari Amman Institute of Technology</span>
              </div>

              <div class="logoBadgeWrapper" id="elem-logo">
                <div class="logoBadgeCircle">
                  ${
                    !options.missingLogo && logoImgBase64
                      ? `<img src="${logoImgBase64}" alt="Bannari Amman Institute of Technology" class="logoImage" />`
                      : `<div class="logoFallbackBadge">BIT</div>`
                  }
                  <span class="badgeSchoolName">Bannari Amman</span>
                  <span class="badgeTagline">Stay Ahead</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Metadata Row -->
      <div class="metaInfoRow">
        <span>Nov 12, 2026</span>
        <span>•</span>
        <span>From: <strong>SRT Administration</strong></span>
      </div>

      <!-- Action Buttons -->
      <div class="actionButtonGroup">
        <button type="button" class="openBtn" id="btn-open">Open</button>
        <button type="button" class="closeBtn" id="btn-close">Close</button>
      </div>
    </div>
  </div>
</body>
</html>`;
}

interface ViewportConfig {
  name: string;
  width: number;
  height: number;
  isMobile: boolean;
}

const VIEWPORTS: ViewportConfig[] = [
  { name: "320px_iPhone_SE", width: 320, height: 568, isMobile: true },
  { name: "360px_Small_Android", width: 360, height: 740, isMobile: true },
  { name: "390px_iPhone_14", width: 390, height: 844, isMobile: true },
  { name: "414px_iPhone_Plus", width: 414, height: 896, isMobile: true },
  { name: "667x375_Phone_Landscape", width: 667, height: 375, isMobile: true },
  { name: "768px_iPad_Portrait", width: 768, height: 1024, isMobile: false },
  { name: "1024px_Tablet_Landscape", width: 1024, height: 768, isMobile: false },
  { name: "1366px_Laptop", width: 1366, height: 768, isMobile: false },
  { name: "1920px_Desktop_FullHD", width: 1920, height: 1080, isMobile: false }
];

async function runTests() {
  console.log("================================================================================");
  console.log("BIRTHDAY POP-UP RESPONSIVENESS AND LAYOUT VERIFICATION TEST SUITE");
  console.log("================================================================================");

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"]
  });

  const page = await browser.newPage();
  let allPassed = true;

  try {
    // 1. Verify standard celebration across all 9 viewports
    console.log("\n--- TEST 1: VIEWPORT ADAPTABILITY & ZERO-HORIZONTAL-OVERFLOW AUDIT ---");
    for (const vp of VIEWPORTS) {
      await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.isMobile });
      const html = generateHtml({ recipientName: "Anushka A (Class 10-A)" });
      await page.setContent(html, { waitUntil: "load" });
      // Wait for modalPopUp entry animation (0.35s) to settle at 1.0 scale
      await new Promise(r => setTimeout(r, 400));

      const metrics = await page.evaluate(() => {
        const body = document.body;
        const modal = document.getElementById("test-modal")!;
        const card = document.getElementById("test-card")!;
        const closeBtn = document.getElementById("test-close-btn")!;
        const closeRect = closeBtn.getBoundingClientRect();
        const photoElem = document.getElementById("elem-photo")!;
        const headingElem = document.getElementById("elem-heading")!;
        const salutationElem = document.getElementById("elem-salutation")!;
        const signatureElem = document.getElementById("elem-signature")!;
        const logoElem = document.getElementById("elem-logo")!;

        const photoRect = photoElem.getBoundingClientRect();
        const headingRect = headingElem.getBoundingClientRect();
        const salutationRect = salutationElem.getBoundingClientRect();
        const signatureRect = signatureElem.getBoundingClientRect();
        const logoRect = logoElem.getBoundingClientRect();

        return {
          windowInnerWidth: window.innerWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: body.scrollWidth,
          modalWidth: modal.getBoundingClientRect().width,
          modalScrollWidth: modal.scrollWidth,
          modalClientWidth: modal.clientWidth,
          cardWidth: card.getBoundingClientRect().width,
          cardScrollWidth: card.scrollWidth,
          cardClientWidth: card.clientWidth,
          closeBtnWidth: closeRect.width,
          closeBtnHeight: closeRect.height,
          closeBtnRight: closeRect.right,
          closeBtnTop: closeRect.top,
          // Vertical reading order checks
          photoTop: photoRect.top,
          headingTop: headingRect.top,
          salutationTop: salutationRect.top,
          signatureTop: signatureRect.top,
          logoTop: logoRect.top
        };
      });

      const hasHorizScroll =
        metrics.docScrollWidth > metrics.windowInnerWidth ||
        metrics.cardScrollWidth > metrics.cardClientWidth + 1; // +1 tolerance for subpixel rounding

      const closeBtnValid =
        metrics.closeBtnWidth >= 40 &&
        metrics.closeBtnHeight >= 40 &&
        metrics.closeBtnRight <= metrics.windowInnerWidth + 5;

      const isMobileWidth = vp.width < 768;
      // In mobile stacked layout, photo should be above heading, heading above salutation, signature above logo
      const mobileOrderCorrect = isMobileWidth
        ? metrics.photoTop < metrics.headingTop &&
          metrics.headingTop < metrics.salutationTop &&
          metrics.signatureTop < metrics.logoTop
        : true;

      const passed = !hasHorizScroll && closeBtnValid && mobileOrderCorrect;
      if (!passed) {
        allPassed = false;
        console.log("DEBUG FAIL:", {
          hasHorizScroll,
          closeBtnValid,
          mobileOrderCorrect,
          docScrollWidth: metrics.docScrollWidth,
          windowInnerWidth: metrics.windowInnerWidth,
          cardScrollWidth: metrics.cardScrollWidth,
          cardClientWidth: metrics.cardClientWidth,
          closeBtnWidth: metrics.closeBtnWidth,
          closeBtnHeight: metrics.closeBtnHeight,
          closeBtnRight: metrics.closeBtnRight
        });
      }

      console.log(
        `[${passed ? "PASS" : "FAIL"}] ${vp.name.padEnd(26)} | DocScroll: ${metrics.docScrollWidth}/${metrics.windowInnerWidth} | CardScroll: ${metrics.cardScrollWidth}/${metrics.cardClientWidth} | CloseBtn: ${metrics.closeBtnWidth.toFixed(0)}x${metrics.closeBtnHeight.toFixed(0)}px | MobileOrder: ${mobileOrderCorrect ? "OK" : "INVERTED"}`
      );

      // Save screenshot for key widths
      if (["320px_iPhone_SE", "390px_iPhone_14", "768px_iPad_Portrait", "1366px_Laptop"].includes(vp.name)) {
        const shotPath = path.join(ARTIFACT_DIR, `screenshot_birthday_popup_${vp.name}.png`);
        await page.screenshot({ path: shotPath, fullPage: false });
      }
    }

    // 2. TEST 2: Long Recipient Name Graceful Wrapping
    console.log("\n--- TEST 2: LONG RECIPIENT NAME STRESS TEST (320px & 390px) ---");
    const longName = "Anushka Anandan Thirunavukkarasu (Class 10-A / Biology-Maths)";
    for (const testWidth of [320, 390]) {
      await page.setViewport({ width: testWidth, height: 600, isMobile: true });
      const html = generateHtml({ recipientName: longName });
      await page.setContent(html, { waitUntil: "load" });

      const metrics = await page.evaluate(() => {
        const modal = document.getElementById("test-modal")!;
        const card = document.getElementById("test-card")!;
        const recipient = document.getElementById("elem-recipient")!;
        return {
          windowInnerWidth: window.innerWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          cardScrollWidth: card.scrollWidth,
          cardClientWidth: card.clientWidth,
          recipientRectWidth: recipient.getBoundingClientRect().width,
          cardRectWidth: card.getBoundingClientRect().width
        };
      });

      const passed =
        metrics.docScrollWidth <= metrics.windowInnerWidth &&
        metrics.cardScrollWidth <= metrics.cardClientWidth + 1 &&
        metrics.recipientRectWidth <= metrics.cardRectWidth;

      if (!passed) allPassed = false;
      console.log(
        `[${passed ? "PASS" : "FAIL"}] Long Name at ${testWidth}px | CardScrollW: ${metrics.cardScrollWidth}px (Client: ${metrics.cardClientWidth}px) | RecipientW: ${metrics.recipientRectWidth.toFixed(0)}px <= CardW: ${metrics.cardRectWidth.toFixed(0)}px`
      );

      if (testWidth === 320) {
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, "screenshot_birthday_popup_320px_long_name.png")
        });
      }
    }

    // 3. TEST 3: Fallbacks (Missing Photo & Missing Logo)
    console.log("\n--- TEST 3: RESILIENCY FALLBACKS AUDIT ---");
    await page.setViewport({ width: 360, height: 740, isMobile: true });
    const fallbackHtml = generateHtml({
      recipientName: "Anushka A",
      missingPhoto: true,
      missingLogo: true
    });
    await page.setContent(fallbackHtml, { waitUntil: "load" });

    const fallbackMetrics = await page.evaluate(() => {
      const modal = document.getElementById("test-modal")!;
      const card = document.getElementById("test-card")!;
      const fallbackDeity = document.getElementById("fallback-deity");
      const fallbackLogo = document.querySelector(".logoFallbackBadge");
      return {
        hasFallbackDeity: !!fallbackDeity,
        hasFallbackLogo: !!fallbackLogo,
        docScrollWidth: document.documentElement.scrollWidth,
        windowWidth: window.innerWidth,
        cardScrollWidth: card.scrollWidth,
        cardClientWidth: card.clientWidth
      };
    });

    const fallbackPassed =
      fallbackMetrics.hasFallbackDeity &&
      fallbackMetrics.hasFallbackLogo &&
      fallbackMetrics.docScrollWidth <= fallbackMetrics.windowWidth &&
      fallbackMetrics.cardScrollWidth <= fallbackMetrics.cardClientWidth + 1;

    if (!fallbackPassed) allPassed = false;
    console.log(
      `[${fallbackPassed ? "PASS" : "FAIL"}] Missing Photo & Logo Fallbacks | DeityFallback: ${fallbackMetrics.hasFallbackDeity} | LogoFallback: ${fallbackMetrics.hasFallbackLogo} | ScrollOK: ${fallbackMetrics.docScrollWidth <= fallbackMetrics.windowWidth}`
    );

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "screenshot_birthday_popup_fallback_resiliency.png")
    });

  } finally {
    await browser.close();
  }

  console.log("\n================================================================================");
  console.log(`FINAL RESULT: ${allPassed ? "ALL RESPONSIVE AUDITS PASSED 100%" : "FAILURES DETECTED"}`);
  console.log("================================================================================");

  if (!allPassed) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
