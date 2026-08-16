import { useEffect, useState } from "react";
import { HiCheck, HiArrowRight } from "react-icons/hi2";
import { authApi } from "../../services/api.js";
import { useAuthStore } from "../../store/authStore.js";
import Logo from "../common/Logo.jsx";

const RESEND_DELAY_SECONDS = 60;

export default function EmailVerification() {
  const user = useAuthStore((state) => state.user);
  const debugOtp = useAuthStore((state) => state.verificationDebugOtp);
  const patchUser = useAuthStore((state) => state.patchUser);
  const setVerificationDebugOtp = useAuthStore((state) => state.setVerificationDebugOtp);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("We sent a six-digit code when you created your account. It expires in ten minutes.");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (!resendIn) return undefined;
    const timer = window.setInterval(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  async function verify(event) {
    event.preventDefault();
    if (otp.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      const result = await authApi.verifyOtp({ email: user.email, otp, purpose: "verify" });
      patchUser(result.user || { verified: true });
      setVerificationDebugOtp("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "That code is invalid or expired. Request a new code and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setLoading(true);
    setError("");
    try {
      const result = await authApi.sendVerification(user.email);
      setVerificationDebugOtp(result.debugOtp || "");
      setMessage("If this address needs verification, a new code has been sent. Check your inbox and spam folder.");
      setResendIn(RESEND_DELAY_SECONDS);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "We could not send another code yet. Please wait and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    try {
      await authApi.logout();
    } finally {
      clearSession();
    }
  }

  return (
    <main className="verification-page">
      <section className="verification-card">
        <Logo />
        <span className="auth-kicker">One last step</span>
        <h1>Verify your email</h1>
        <p>Enter the code sent to <strong>{user.email}</strong> before you can start conversations, send messages, make calls, or add friends.</p>
        {debugOtp && <div className="development-otp">Local development code: <strong>{debugOtp}</strong></div>}
        {message && <div className="verification-message">{message}</div>}
        <form onSubmit={verify} className="verification-form">
          <label htmlFor="verification-otp">Verification code</label>
          <input
            id="verification-otp"
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            placeholder="000000"
            className="otp-input"
            autoFocus
            required
          />
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="primary-button" disabled={loading || otp.length !== 6}>
            {loading ? "Verifying…" : <>Verify email <HiCheck /></>}
          </button>
        </form>
        <button type="button" className="text-link verification-resend" onClick={resend} disabled={loading || resendIn > 0}>
          {resendIn ? `Resend code in ${resendIn}s` : <>Resend code <HiArrowRight /></>}
        </button>
        <button type="button" className="verification-signout" onClick={signOut}>Use a different account</button>
      </section>
    </main>
  );
}
