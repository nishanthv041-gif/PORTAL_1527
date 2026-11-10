/**
 * Unified Report Card Extraction Engine
 * Re-exports modular extractors and maintains backward compatibility.
 */

export * from "./extract/index";
export * from "./extract/types";
export * from "./extract/normalizer";
export * from "./extract/readers/spreadsheet";
export * from "./extract/readers/pdfText";
export * from "./extract/readers/ssrfGuard";
export * from "./extract/readers/urlReader";
export * from "./extract/providers/gemini";
export * from "./extract/providers/tesseract";
export * from "./extract/providers/bedrock";
export * from "./extract/studentMatcher";

// Legacy compatibility aliases
export { extractWithGeminiVision } from "./extractLegacy";
