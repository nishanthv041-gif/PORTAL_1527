import assert from "node:assert";
import { createWorker } from "tesseract.js";
import { parseTsvToWordBoxes } from "../frontend/lib/scan/ocr";
import { reconstructTableFromWords } from "../frontend/lib/scan/table-reconstruction";
import { ScanResultSchema } from "../frontend/lib/scan/types";

async function runScanVerification() {
  console.log("=== RUNNING SCAN ENGINE VERIFICATION ON TEST IMAGE ===");

  const worker = await createWorker("eng");
  const res = await worker.recognize("scratch/2nd-mark-sheet.png", {}, { tsv: true });
  await worker.terminate();

  const words = parseTsvToWordBoxes(res.data.tsv);
  assert(words.length > 20, "Should extract at least 20 words from test image");
  console.log(`✔ Extracted ${words.length} words with 2D bounding boxes`);

  const result = reconstructTableFromWords(words, {
    defaultMaxMarks: 100,
    defaultPassMarks: 35,
  });

  // Validate Zod schema
  const validated = ScanResultSchema.parse(result);
  console.log(`✔ ScanResultSchema validated successfully (Layout: ${validated.layout})`);

  console.log(`✔ Extracted ${validated.students.length} students:`);
  validated.students.forEach((st, idx) => {
    console.log(
      `   [${idx + 1}] ${st.name} | Roll: ${st.rollNo} | Subjects: ${st.subjects
        .map((s) => `${s.name}: ${s.marks}`)
        .join(", ")} | Total: ${st.printedTotal}`
    );
  });

  assert.strictEqual(validated.students.length, 3, "Expected exactly 3 students");

  const s1 = validated.students[0];
  assert(s1.name.toUpperCase().includes("ANUSHKA"), `Student 1 name should be Anushka: ${s1.name}`);
  assert.strictEqual(s1.rollNo, "7376252AD114", `Student 1 roll should match: ${s1.rollNo}`);
  assert.strictEqual(s1.subjects.find((s) => s.name === "TAMIL")?.marks, 86, "Anushka Tamil should be 86");
  assert.strictEqual(s1.subjects.find((s) => s.name === "ENGLISH")?.marks, 91, "Anushka English should be 91");
  assert.strictEqual(s1.subjects.find((s) => s.name === "MATHEMATICS")?.marks, 88, "Anushka Maths should be 88");
  assert.strictEqual(s1.subjects.find((s) => s.name === "SCIENCE")?.marks, 84, "Anushka Science should be 84");
  assert.strictEqual(s1.subjects.find((s) => s.name === "SOCIAL SCIENCE")?.marks, 90, "Anushka Social should be 90");

  const s3 = validated.students[2];
  assert(s3.name.toUpperCase().includes("KARUPPUSAMY"), `Student 3 name should be Karuppusamy: ${s3.name}`);
  assert.strictEqual(s3.rollNo, "7376252AD208", `Student 3 roll should match: ${s3.rollNo}`);
  assert.strictEqual(s3.subjects.find((s) => s.name === "TAMIL")?.marks, 81, "Karuppusamy Tamil should be 81");
  assert.strictEqual(s3.subjects.find((s) => s.name === "ENGLISH")?.marks, 85, "Karuppusamy English should be 85");
  assert.strictEqual(s3.subjects.find((s) => s.name === "MATHEMATICS")?.marks, 89, "Karuppusamy Maths should be 89");
  assert.strictEqual(s3.subjects.find((s) => s.name === "SCIENCE")?.marks, 86, "Karuppusamy Science should be 86");
  assert.strictEqual(s3.subjects.find((s) => s.name === "SOCIAL SCIENCE")?.marks, 83, "Karuppusamy Social should be 83");

  console.log("🎉 SCAN ENGINE VERIFICATION PASSED WITH 100% ACCURACY! 🎉");
}

runScanVerification().catch((err) => {
  console.error("❌ Scan verification failed:", err);
  process.exit(1);
});

