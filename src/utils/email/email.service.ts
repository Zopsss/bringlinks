import sgMail from "@sendgrid/mail";
import { validateEnv } from "../../../config/validateEnv";
import Logging from "../../library/logging";

type AdminSignupCodeRequestPayload = {
  name?: string;
  email: string;
  message?: string;
};

class EmailService {
  private static ensureConfigured(): void {
    const apiKey = (validateEnv as any).SENDGRID_API_KEY as string | undefined;
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error("SendGrid is not configured. Missing SENDGRID_API_KEY");
    }
    sgMail.setApiKey(apiKey);
  }

  static async sendAdminSignupCodeRequest(payload: AdminSignupCodeRequestPayload) {
    this.ensureConfigured();

    const adminEmail = (validateEnv as any).ADMIN_NOTIFICATION_EMAIL as string | undefined;
    const fromEmail = ((validateEnv as any).EMAIL_FROM as string | undefined) || (adminEmail as string);

    if (!adminEmail || adminEmail.trim().length === 0) {
      throw new Error("Missing ADMIN_NOTIFICATION_EMAIL in environment");
    }

    const subject = "New Signup Code Request";
    const lines: string[] = [];
    lines.push("A user has requested a signup code.");
    lines.push("");
    lines.push(`Email: ${payload.email}`);
    if (payload.name) lines.push(`Name: ${payload.name}`);
    if (payload.message) {
      lines.push("");
      lines.push("Message:");
      lines.push(payload.message);
    }

    const msg = {
      to: adminEmail,
      from: fromEmail,
      subject,
      text: lines.join("\n"),
    } as any;

    try {
      await sgMail.send(msg);
      Logging.log("Admin signup code request email sent");
    } catch (error: any) {
      const response = error?.response;
      const body = response?.body;
      Logging.error({ hint: "SendGrid send failed", status: response?.statusCode, body });
      throw new Error(body?.errors?.[0]?.message || error.message || "Failed to send email");
    }
  }
}

export default EmailService;


