import { GeminiProvider } from "./extract/providers/gemini";

export async function extractWithGeminiVision(
  imageBuffer: Buffer,
  mimeType: string = "image/png"
) {
  const provider = new GeminiProvider();
  if (!(await provider.isAvailable())) return null;
  try {
    return await provider.extractFromImage(imageBuffer, mimeType);
  } catch {
    return null;
  }
}
