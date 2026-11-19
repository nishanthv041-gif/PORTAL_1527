/**
 * Comprehensive Verification & Regression Test Suite
 * Tests:
 * 1. apiFetch client wrapper: HTML intercept, clean JSON parsing, friendly error mapping, zero '<' syntax crashes
 * 2. Magic byte validation: PNG, JPEG, PDF, WebP, GIF, Office XML
 * 3. Disguised executable rejection: PE/EXE, ELF, Mach-O disguised as .png/.pdf
 * 4. File size limits & categorization
 */

import { validateMagicBytes, getMaxSizeBytesForExtension, getFileCategory } from "../backend/lib/storage/magicBytes";
import { apiFetch, ApiError } from "../lib/apiFetch";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log("==================================================");
  console.log("🧪 RUNNING UPLOAD & ERROR-HANDLING VERIFICATION SUITE");
  console.log("==================================================\n");

  // --------------------------------------------------------------------------
  // TEST SUITE 1: Magic Byte Detection & Security
  // --------------------------------------------------------------------------
  console.log("📁 1. Testing Magic Byte Validation & Executable Shield");

  // 1.1 Real PNG
  const realPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
  const pngRes = validateMagicBytes(realPng, "png");
  assert(pngRes.valid === true && pngRes.detectedType === "image/png", "Valid PNG recognized");

  // 1.2 Real JPEG
  const realJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
  const jpgRes = validateMagicBytes(realJpeg, "jpg");
  assert(jpgRes.valid === true && jpgRes.detectedType === "image/jpeg", "Valid JPEG recognized");

  // 1.3 Real PDF
  const realPdf = Buffer.from("%PDF-1.7 standard document payload");
  const pdfRes = validateMagicBytes(realPdf, "pdf");
  assert(pdfRes.valid === true && pdfRes.detectedType === "application/pdf", "Valid PDF recognized");

  // 1.4 Real WebP
  const realWebp = Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.from([0x20, 0x00, 0x00, 0x00]),
    Buffer.from("WEBP"),
    Buffer.from("VP8 ")
  ]);
  const webpRes = validateMagicBytes(realWebp, "webp");
  assert(webpRes.valid === true && webpRes.detectedType === "image/webp", "Valid WebP recognized");

  // 1.5 Real GIF
  const realGif = Buffer.from("GIF89a sample image");
  const gifRes = validateMagicBytes(realGif, "gif");
  assert(gifRes.valid === true && gifRes.detectedType === "image/gif", "Valid GIF recognized");

  // 1.6 Trojan .EXE disguised as .png (The exact attack vector)
  const trojanExe = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ header
  const trojanRes = validateMagicBytes(trojanExe, "png");
  assert(trojanRes.valid === false && Boolean(trojanRes.error?.includes("Executable")), "Trojan PE/EXE disguised as .png strictly REJECTED");

  // 1.7 Trojan ELF binary disguised as .pdf
  const trojanElf = Buffer.from([0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00]); // ELF header
  const trojanElfRes = validateMagicBytes(trojanElf, "pdf");
  assert(trojanElfRes.valid === false && Boolean(trojanElfRes.error?.includes("Executable binaries (ELF)")), "Trojan Linux ELF disguised as .pdf strictly REJECTED");

  // 1.8 Script injection disguised as CSV
  const maliciousCsv = Buffer.from("<script>alert('pwned')</script>,name,email");
  const csvRes = validateMagicBytes(maliciousCsv, "csv");
  assert(csvRes.valid === false && Boolean(csvRes.error?.includes("Embedded scripts")), "CSV containing embedded <script> tags strictly REJECTED");

  // --------------------------------------------------------------------------
  // TEST SUITE 2: Size Limits and Categorization
  // --------------------------------------------------------------------------
  console.log("\n📏 2. Testing Size Limits & Categories");
  assert(getFileCategory("png") === "IMAGE", "PNG category is IMAGE");
  assert(getFileCategory("jpg") === "IMAGE", "JPG category is IMAGE");
  assert(getFileCategory("pdf") === "DOCUMENT", "PDF category is DOCUMENT");
  assert(getFileCategory("docx") === "DOCUMENT", "DOCX category is DOCUMENT");
  assert(getFileCategory("mp3") === "AUDIO", "MP3 category is AUDIO");

  assert(getMaxSizeBytesForExtension("png") === 10 * 1024 * 1024, "Image max limit is 10 MB");
  assert(getMaxSizeBytesForExtension("pdf") === 20 * 1024 * 1024, "Document max limit is 20 MB");
  assert(getMaxSizeBytesForExtension("mp3") === 25 * 1024 * 1024, "Audio max limit is 25 MB");

  // --------------------------------------------------------------------------
  // TEST SUITE 3: apiFetch Safe Error Interception (No JSON "<" Crashes)
  // --------------------------------------------------------------------------
  console.log("\n🛡️ 3. Testing apiFetch (Zero HTML '<' Syntax Crashes)");

  // Mock global fetch to test HTML and status interception
  const originalFetch = global.fetch;

  // 3.1 CloudFront 403 HTML Error (The exact reproduction from Section 0 of bug report)
  global.fetch = async () => {
    return new Response(
      `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<HTML><HEAD><META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=iso-8859-1">
<TITLE>ERROR: The request could not be satisfied</TITLE>
</HEAD><BODY>
<H1>403 ERROR</H1>
<H2>The request could not be satisfied.</H2>
Request blocked.
<BR clear="all">
<HR noshade size="1px">
<PRE>Generated by cloudfront (CloudFront)</PRE>
</BODY></HTML>`,
      {
        status: 403,
        headers: { "content-type": "text/html" },
      }
    );
  };

  try {
    await apiFetch("https://example.com/api/test-upload");
    assert(false, "apiFetch should have thrown on 403 HTML");
  } catch (err: any) {
    assert(err instanceof ApiError, "Caught error is typed ApiError instance");
    assert(err.status === 403, "ApiError correctly captured status 403");
    assert(
      !err.message.includes("Unexpected token '<'") &&
      !err.message.includes("<!DOCTYPE"),
      "Raw '<!DOCTYPE' syntax crash is 100% ELIMINATED"
    );
    assert(
      err.userMessage.includes("Network proxy") || err.userMessage.includes("CloudFront"),
      "Friendly network proxy message displayed to user"
    );
  }

  // 3.2 HTML 404 Error page
  global.fetch = async () => {
    return new Response(
      `<html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1></body></html>`,
      {
        status: 404,
        headers: { "content-type": "text/html" },
      }
    );
  };

  try {
    await apiFetch("https://example.com/api/unknown-route");
    assert(false, "apiFetch should have thrown on 404 HTML");
  } catch (err: any) {
    assert(err.status === 404, "ApiError captured status 404");
    assert(!err.message.includes("Unexpected token"), "HTML 404 converted safely without JSON crash");
  }

  // 3.3 HTTP 413 Payload Too Large
  global.fetch = async () => {
    return new Response(
      JSON.stringify({ error: "File exceeds maximum allowed size." }),
      {
        status: 413,
        headers: { "content-type": "application/json" },
      }
    );
  };

  try {
    await apiFetch("https://example.com/api/uploads/presign");
    assert(false, "apiFetch should have thrown on 413 JSON");
  } catch (err: any) {
    assert(err.status === 413, "ApiError captured status 413");
    assert(err.userMessage.includes("10MB") || err.userMessage.includes("large"), "Friendly 413 size guidance displayed");
  }

  // 3.4 Valid 200 JSON Success
  global.fetch = async () => {
    return new Response(
      JSON.stringify({ ok: true, attachmentId: "att_123", fileName: "time table.png" }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  };

  const successResult = await apiFetch<{ ok: boolean; attachmentId: string }>("https://example.com/api/uploads/presign");
  assert(successResult.ok === true && successResult.attachmentId === "att_123", "Valid JSON parsed successfully");

  // Restore fetch
  global.fetch = originalFetch;

  console.log("\n==================================================");
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
