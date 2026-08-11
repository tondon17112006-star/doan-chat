import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transport = null;

function getTransport() {
  if (!env.smtp.host) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      ...(env.smtp.user ? { auth: { user: env.smtp.user, pass: env.smtp.pass } } : {}),
    });
  }
  return transport;
}

export async function sendOtpEmail(email, otp, purpose) {
  const mailer = getTransport();
  if (!mailer) return false;
  const isPasswordReset = purpose === "reset";
  await mailer.sendMail({
    from: env.smtp.from,
    to: email,
    subject: isPasswordReset ? "Reset your Lumina password" : "Verify your Lumina email",
    text: `Your Lumina ${isPasswordReset ? "password reset" : "verification"} code is ${otp}. It expires in 10 minutes.`,
  });
  return true;
}
