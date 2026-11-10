import {
  BedrockRuntimeClient,
  ConverseCommand,
  ToolChoice,
  Tool
} from "@aws-sdk/client-bedrock-runtime";
import {
  ExtractedSheetResult,
  ExtractedStudent,
  ExtractionOptions,
  ExtractionProvider
} from "../types";
import { normalizeSubjectName } from "../normalizer";

// Pricing per 1M tokens (in USD)
const BEDROCK_PRICING: Record<string, { inRate: number; outRate: number }> = {
  "haiku": { inRate: 0.80, outRate: 4.00 },
  "sonnet": { inRate: 3.00, outRate: 15.00 }
};

const MARK_SHEET_TOOL: Tool = {
  toolSpec: {
    name: "record_mark_sheet_extraction",
    description: "Saves structured school mark sheet data extracted from a document.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          subjectCount: {
            type: "integer",
            description: "Total number of unique subject columns detected in the sheet."
          },
          maxPerSubject: {
            type: "number",
            description: "Maximum mark per subject (e.g. 100, 50, 75)."
          },
          maxTotal: {
            type: ["number", "null"],
            description: "Maximum total declared in the document header or title, if any."
          },
          subjects: {
            type: "array",
            items: { type: "string" },
            description: "List of subject names in exact order of appearance."
          },
          students: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Full student name." },
                rollNo: { type: ["string", "null"], description: "Roll number or admission number." },
                marks: {
                  type: "object",
                  additionalProperties: {
                    oneOf: [
                      { type: "number" },
                      { type: "string", enum: ["AB", "Absent"] },
                      { type: "null" }
                    ]
                  },
                  description: "Subject scores mapped to subject names."
                },
                total: { type: ["number", "null"], description: "Declared row total from the sheet." }
              },
              required: ["name", "marks"]
            }
          },
          uncertain: {
            type: "array",
            items: { type: "string" },
            description: "List of student-subject keys where the mark was smudged or uncertain."
          }
        },
        required: ["subjectCount", "maxPerSubject", "subjects", "students"]
      }
    }
  }
};

export class BedrockProvider implements ExtractionProvider {
  name = "BEDROCK" as const;

  async isAvailable(): Promise<boolean> {
    // Strictly OFF by default unless BEDROCK_ENABLED is explicitly set to true
    if (process.env.BEDROCK_ENABLED !== "true") {
      return false;
    }
    return true;
  }

  private getClient(): { client: BedrockRuntimeClient; modelId: string } {
    const region =
      process.env.BEDROCK_REGION ||
      process.env.AWS_REGION ||
      "ap-southeast-2";

    // Default to high-speed, cost-efficient Haiku profile for APAC
    const modelId =
      process.env.BEDROCK_MODEL_ID ||
      "apac.anthropic.claude-3-5-haiku-20241022-v1:0";

    const client = new BedrockRuntimeClient({ region });
    return { client, modelId };
  }

  async extractFromImage(
    buffer: Buffer,
    mimeType: string = "image/png",
    options?: ExtractionOptions
  ): Promise<ExtractedSheetResult> {
    const startTime = Date.now();
    const { client, modelId } = this.getClient();

    // Map mime types for Bedrock image format
    let format: "png" | "jpeg" | "webp" | "gif" = "png";
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) format = "jpeg";
    else if (mimeType.includes("webp")) format = "webp";
    else if (mimeType.includes("gif")) format = "gif";

    const command = new ConverseCommand({
      modelId,
      messages: [
        {
          role: "user",
          content: [
            {
              text: "Extract student marks and subject columns from this school mark sheet image. Count all subjects and record every student row."
            },
            {
              image: {
                format,
                source: {
                  bytes: new Uint8Array(buffer)
                }
              }
            }
          ]
        }
      ],
      toolConfig: {
        tools: [MARK_SHEET_TOOL],
        toolChoice: {
          tool: {
            name: "record_mark_sheet_extraction"
          }
        }
      }
    });

    const response = await client.send(command);
    return this.parseBedrockResponse(response, modelId, startTime);
  }

  async extractFromText(
    text: string,
    options?: ExtractionOptions
  ): Promise<ExtractedSheetResult> {
    const startTime = Date.now();
    const { client, modelId } = this.getClient();

    const command = new ConverseCommand({
      modelId,
      messages: [
        {
          role: "user",
          content: [
            {
              text: `Extract student marks and subject columns from this school mark sheet text:\n\n${text}`
            }
          ]
        }
      ],
      toolConfig: {
        tools: [MARK_SHEET_TOOL],
        toolChoice: {
          tool: {
            name: "record_mark_sheet_extraction"
          }
        }
      }
    });

    const response = await client.send(command);
    return this.parseBedrockResponse(response, modelId, startTime);
  }

  private parseBedrockResponse(
    response: any,
    modelId: string,
    startTime: number
  ): ExtractedSheetResult {
    // Find tool use block in response content
    const content = response?.output?.message?.content || [];
    const toolUse = content.find((c: any) => c.toolUse?.name === "record_mark_sheet_extraction");

    if (!toolUse || !toolUse.toolUse?.input) {
      throw new Error("Bedrock did not return structured mark sheet output.");
    }

    const output = toolUse.toolUse.input;
    const warnings: string[] = [];
    const rawSubjects: string[] = output.subjects || [];
    const normalizedSubjects = rawSubjects.map(normalizeSubjectName);

    if (output.maxTotal && normalizedSubjects.length > 0) {
      const expected = Math.round(output.maxTotal / (output.maxPerSubject || 100));
      if (expected !== normalizedSubjects.length) {
        warnings.push(
          `Expected ${expected} subjects based on declared maximum ${output.maxTotal}, but found ${normalizedSubjects.length}. A column may be missing.`
        );
      }
    }

    const students: ExtractedStudent[] = (output.students || []).map((st: any) => {
      const marks: Record<string, number | null | "AB"> = {};
      const confidence: Record<string, number> = {};

      normalizedSubjects.forEach((subName, idx) => {
        const origKey = rawSubjects[idx] || subName;
        let val = st.marks?.[origKey] !== undefined ? st.marks[origKey] : st.marks?.[subName];
        if (val === undefined) val = null;

        if (val === "AB" || val === "Absent") {
          marks[subName] = "AB";
          confidence[subName] = 0.95;
        } else if (typeof val === "number") {
          marks[subName] = val;
          confidence[subName] = output.uncertain?.includes(`${st.name}-${subName}`) ? 0.4 : 0.95;
        } else {
          marks[subName] = null;
          confidence[subName] = 0;
        }
      });

      const calculatedSum = Object.values(marks).reduce<number>(
        (acc, m) => (typeof m === "number" ? acc + m : acc),
        0
      );

      if (st.total !== null && st.total !== undefined && st.total !== calculatedSum) {
        warnings.push(
          `${st.name}: sheet total ${st.total} vs calculated ${calculatedSum}, please check.`
        );
      }

      return {
        name: st.name || "Student",
        rollNo: st.rollNo || undefined,
        marks,
        totalFromSheet: st.total || undefined,
        confidence
      };
    });

    const usage = response.usage;
    const tokensIn = usage?.inputTokens || 0;
    const tokensOut = usage?.outputTokens || 0;

    const pricingKey = modelId.toLowerCase().includes("sonnet") ? "sonnet" : "haiku";
    const pricing = BEDROCK_PRICING[pricingKey];
    const estimatedCostUsd =
      (tokensIn / 1_000_000) * pricing.inRate + (tokensOut / 1_000_000) * pricing.outRate;

    return {
      maxMarkPerSubject: output.maxPerSubject || 100,
      maxTotalDeclared: output.maxTotal || undefined,
      subjects: normalizedSubjects,
      students,
      warnings,
      providerUsed: "BEDROCK",
      tokensUsed: { input: tokensIn, output: tokensOut },
      estimatedCostUsd: parseFloat(estimatedCostUsd.toFixed(6)),
      durationMs: Date.now() - startTime
    };
  }
}
