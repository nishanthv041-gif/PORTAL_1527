/**
 * Universal Safe API Fetch Client
 * Prevents "Unexpected token '<', '<!DOCTYPE '... is not valid JSON" errors by inspecting
 * HTTP status codes and Content-Type before parsing JSON, and translating raw server/HTML/CloudFront
 * responses into clean, human-readable errors.
 */

export class ApiError extends Error {
  public status: number;
  public code?: string;
  public userMessage: string;
  public rawText?: string;
  public isNetworkError: boolean;

  constructor(options: {
    status: number;
    userMessage: string;
    code?: string;
    rawText?: string;
    isNetworkError?: boolean;
  }) {
    super(options.userMessage);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.userMessage = options.userMessage;
    this.rawText = options.rawText;
    this.isNetworkError = Boolean(options.isNetworkError);
  }
}

/**
 * Extracts a friendly summary message from an unexpected HTML response body.
 */
function extractSummaryFromHtml(html: string, status: number): string {
  // Check for common CloudFront / CDN error signatures
  if (html.includes("CloudFront") || html.includes("403 ERROR") || html.includes("Request blocked")) {
    if (status === 403) {
      return "Network proxy blocked the request (payload may exceed maximum edge upload limit).";
    }
    return "CloudFront edge proxy encountered an issue. Please try again.";
  }

  // Extract <title> if present
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    const title = titleMatch[1].trim();
    if (title.length > 0 && title.length < 100) {
      return title;
    }
  }

  // Extract <h1> if present
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match && h1Match[1]) {
    const h1 = h1Match[1].trim();
    if (h1.length > 0 && h1.length < 100) {
      return h1;
    }
  }

  return `Server returned an unexpected HTML response (HTTP ${status}).`;
}

/**
 * Map standard HTTP status codes to actionable messages.
 */
function mapStatusToFriendlyMessage(status: number, defaultMsg?: string): string {
  switch (status) {
    case 400:
      return defaultMsg || "Bad request. Please verify the submitted data.";
    case 401:
      return "Your session has expired. Please refresh the page or log in again.";
    case 403:
      return defaultMsg || "Access restricted. You do not have permission for this action.";
    case 404:
      return "The requested endpoint or resource was not found.";
    case 413:
      return "File is too large. Images must be ≤ 10MB, documents ≤ 20MB, and audio ≤ 25MB.";
    case 415:
      return "Unsupported file type. Please upload a supported image, document, or audio file.";
    case 429:
      return "Too many requests. Please wait a moment before trying again.";
    case 500:
      return "Internal server error. Please retry in a few moments.";
    case 502:
    case 503:
    case 504:
      return "Server is temporarily unavailable or timed out. Please try again shortly.";
    default:
      return defaultMsg || `Server returned error (${status}).`;
  }
}

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Safe fetch wrapper that guarantees typed JSON on success and typed ApiError on failure.
 * Never throws syntax errors from JSON parsing HTML!
 */
export async function apiFetch<T = any>(
  input: RequestInfo | URL,
  options?: ApiFetchOptions
): Promise<T> {
  const { timeoutMs = 30000, ...fetchOptions } = options || {};

  let controller: AbortController | null = null;
  let timeoutId: NodeJS.Timeout | null = null;

  if (fetchOptions.signal) {
    // Caller already provided a signal
  } else if (typeof AbortController !== "undefined") {
    controller = new AbortController();
    fetchOptions.signal = controller.signal;
    timeoutId = setTimeout(() => {
      controller?.abort();
    }, timeoutMs);
  }

  let res: Response;
  try {
    res = await fetch(input, fetchOptions);
  } catch (err: unknown) {
    if (timeoutId) clearTimeout(timeoutId);
    const errorAny = err as { name?: string; message?: string };
    if (errorAny?.name === "AbortError") {
      throw new ApiError({
        status: 408,
        code: "TIMEOUT",
        userMessage: `Request timed out after ${Math.round(timeoutMs / 1000)} seconds. Please check your internet connection and try again.`,
        isNetworkError: true,
      });
    }
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      userMessage: "Network connection failed. Please verify your internet connection.",
      isNetworkError: true,
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.toLowerCase().includes("application/json");

  // If response is NOT JSON, read text safely to prevent JSON.parse syntax error
  if (!isJson) {
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {
      bodyText = "";
    }

    const cleanSummary = extractSummaryFromHtml(bodyText, res.status);
    const friendlyMessage = mapStatusToFriendlyMessage(res.status, cleanSummary);

    throw new ApiError({
      status: res.status,
      code: `HTTP_${res.status}`,
      userMessage: friendlyMessage,
      rawText: bodyText.slice(0, 500),
    });
  }

  // Response IS JSON - parse safely
  let jsonData: any;
  try {
    jsonData = await res.json();
  } catch (parseErr) {
    throw new ApiError({
      status: res.status,
      code: "INVALID_JSON",
      userMessage: mapStatusToFriendlyMessage(res.status, "Server returned invalid JSON data."),
    });
  }

  if (!res.ok) {
    const serverMessage =
      jsonData?.error ||
      jsonData?.message ||
      jsonData?.userMessage ||
      (typeof jsonData === "string" ? jsonData : undefined);

    const code = jsonData?.code || `HTTP_${res.status}`;
    const friendlyMessage = mapStatusToFriendlyMessage(res.status, serverMessage);

    throw new ApiError({
      status: res.status,
      code,
      userMessage: friendlyMessage,
      rawText: JSON.stringify(jsonData).slice(0, 500),
    });
  }

  return jsonData as T;
}
