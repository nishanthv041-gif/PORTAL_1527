"use server";

export async function sendReportEmailAction(email: string, ipAddress: string | null, timestamp: Date, success: boolean) {
  try {
    // Mock sending email
    console.log(`[EMAIL SERVICE] Sending security alert to ${email}...`);
    console.log(`Details: IP Address: ${ipAddress || 'Unknown'}, Status: ${success ? 'Success' : 'Failed'}, Time: ${timestamp.toLocaleString()}`);
    
    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log(`[EMAIL SERVICE] Successfully sent alert to ${email}`);

    return { success: true, message: "Security alert email sent successfully!" };
  } catch (error) {
    console.error("Failed to send alert email:", error);
    return { error: "Failed to send alert email." };
  }
}
