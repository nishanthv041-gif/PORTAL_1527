import { NextRequest, NextResponse } from "next/server";
import { triggerBusKeypadAction } from "@/backend/api/actions/dashboard/admin/transport/actions";

/**
 * Driver Button Phone / Keypad Speed-Dial Webhook Handler
 * Endpoint: /api/transport/bus-trigger
 *
 * Supported Methods: GET, POST
 * Parameters (query string or JSON body or form):
 *  - phone / callerPhone / From: Driver's keypad mobile number (e.g. "9876543210")
 *  - button / key / digits: Pressed button ("1" = Start Trip/Departure, "2" = Emergency Danger SOS)
 *
 * Actions:
 *  - Button 1: Start Trip & Campus Departure
 *              -> Flips bus status to RUNNING
 *              -> Sends notification to ALL Parents of present Day Scholars + ALL Admins + Assigned In-Charge Teacher
 *  - Button 2: Emergency / Danger Alert (SOS)
 *              -> Flips bus status to DELAYED
 *              -> Sends urgent alert ONLY to In-Charge Teacher + ALL Admins (NEVER PARENTS)
 */

async function handleBusTrigger(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;

    let phone =
      searchParams.get("phone") ||
      searchParams.get("callerPhone") ||
      searchParams.get("From") ||
      searchParams.get("caller") ||
      searchParams.get("from");

    let button =
      searchParams.get("button") ||
      searchParams.get("key") ||
      searchParams.get("digits") ||
      searchParams.get("digit") ||
      "1";

    let secret = searchParams.get("secret") || searchParams.get("token");

    // If POST, also check JSON or Form Body
    if (req.method === "POST") {
      try {
        const contentType = req.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const body = await req.json();
          phone = body.phone || body.callerPhone || body.From || body.caller || body.from || phone;
          button = body.button || body.key || body.digits || body.digit || button;
          secret = body.secret || body.token || secret;
        } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
          const formData = await req.formData();
          phone = (formData.get("phone") || formData.get("callerPhone") || formData.get("From") || formData.get("caller") || phone) as string;
          button = (formData.get("button") || formData.get("key") || formData.get("digits") || formData.get("digit") || button) as string;
          secret = (formData.get("secret") || formData.get("token") || secret) as string;
        }
      } catch (err) {
        // Body reading failed, fallback to query parameters
      }
    }

    // Optional environment variable secret check if configured
    const configuredSecret = process.env.BUS_TRIGGER_SECRET;
    if (configuredSecret && secret !== configuredSecret) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid trigger security token." },
        { status: 401 }
      );
    }

    if (!phone || typeof phone !== "string" || !phone.trim()) {
      return NextResponse.json(
        {
          error: "Driver phone number is required. Pass ?phone=XXXXXXXXXX or { phone: 'XXXXXXXXXX' }.",
          usage: {
            method: "GET or POST",
            endpoint: "/api/transport/bus-trigger",
            parameters: {
              phone: "Driver phone number (e.g. 9876543210)",
              button: "'1' (Trip Started to Parents/Admin) or '2' (Emergency Danger SOS to Teacher/Admin only)",
            },
          },
        },
        { status: 400 }
      );
    }

    const cleanPhone = phone.trim();
    const cleanButton = String(button || "1").trim();

    // Call server action
    const result = await triggerBusKeypadAction({
      callerPhone: cleanPhone,
      buttonKey: cleanButton,
      source: "Driver Keypad Speed-Dial",
    });

    if (result.error) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          callerPhone: cleanPhone,
          buttonKey: cleanButton,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    console.error("Error in /api/transport/bus-trigger:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error processing bus trigger." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleBusTrigger(req);
}

export async function POST(req: NextRequest) {
  return handleBusTrigger(req);
}
