// File: client/src/components/auth/AuthPage.jsx
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { HiArrowRight, HiCheck, HiEye, HiEyeSlash, HiSparkles } from "react-icons/hi2";
import { authApi } from "../../services/api.js";
import { useAuthStore } from "../../store/authStore.js";
import Logo from "../common/Logo.jsx";
import Modal from "../common/Modal.jsx";

export default function AuthPage() {
  const [mode, setMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [demoLoading, setDemoLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const autoDemoStarted = useRef(false);
  const setSession = useAuthStore((state) => state.setSession);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset
  } = useForm({
    defaultValues: { username: "", email: "alex@lumina.chat", password: "Password123!", remember: true }
  });

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo") === "1" && !autoDemoStarted.current) {
      autoDemoStarted.current = true;
      enterDemo();
    }
  }, []);

  async function submit(values) {
    setServerError("");
    try {
      const session = mode === "login" ? await authApi.login(values) : await authApi.register(values);
      setSession(session);
    } catch (error) {
      setServerError(error.response?.data?.message || "We couldn’t sign you in. Please try again.");
    }
  }

  async function enterDemo() {
    setDemoLoading(true);
    setServerError("");
    try {
      setSession(await authApi.demo());
    } catch (error) {
      setServerError(error.response?.data?.message || "The demo is warming up. Try once more.");
    } finally {
      setDemoLoading(false);
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setServerError("");
    reset({ username: "", email: nextMode === "login" ? "alex@lumina.chat" : "", password: nextMode === "login" ? "Password123!" : "", remember: true });
  }

  return (
    <main className="auth-page">
      <div className="auth-orb auth-orb-one" />
      <div className="auth-orb auth-orb-two" />
      <section className="auth-story">
        <Logo />
        <motion.div
          className="auth-copy"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <span className="eyebrow"><HiSparkles /> Thoughtful conversations</span>
          <h1>Closer to the people who <em>matter.</em></h1>
          <p>A calm, beautiful home for messages, shared moments, and everything in between.</p>
          <div className="auth-proof">
            <div className="proof-avatars">
              {["Maya Chen", "Sofia Reyes", "Theo Bennett"].map((name, index) => (
                <img key={name} src={`https://api.dicebear.com/9.x/notionists/svg?seed=${name}`} alt="" style={{ zIndex: 4 - index }} />
              ))}
            </div>
            <span><strong>2,400+</strong> conversations happening now</span>
          </div>
        </motion.div>
        <div className="auth-message-preview">
          <div className="preview-bubble incoming">Made it to the coast 🌊</div>
          <div className="preview-bubble outgoing">That view is everything. Send photos!</div>
          <span>Delivered quietly</span>
        </div>
        <p className="auth-footer">Private by design · Made with care</p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="mobile-auth-logo"><Logo /></div>
          <AnimatePresence mode="wait">
            <motion.div key={mode} initial={{ opacity: 0, x: mode === "login" ? -12 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              <span className="auth-kicker">{mode === "login" ? "Welcome back" : "Join Lumina"}</span>
              <h2>{mode === "login" ? "Your conversations missed you." : "Start something meaningful."}</h2>
              <p className="auth-subtitle">
                {mode === "login" ? "Sign in to pick up right where you left off." : "Create your account—it only takes a moment."}
              </p>

              <form onSubmit={handleSubmit(submit)} className="auth-form">
                {mode === "register" && (
                  <label>
                    <span>Your name</span>
                    <input
                      className={errors.username ? "invalid" : ""}
                      placeholder="Alex Morgan"
                      autoComplete="name"
                      {...register("username", { required: "Tell us what to call you.", minLength: { value: 2, message: "Use at least 2 characters." } })}
                    />
                    {errors.username && <small>{errors.username.message}</small>}
                  </label>
                )}
                <label>
                  <span>Email address</span>
                  <input
                    className={errors.email ? "invalid" : ""}
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    {...register("email", { required: "Email is required." })}
                  />
                  {errors.email && <small>{errors.email.message}</small>}
                </label>
                <label>
                  <span>Password</span>
                  <div className={`password-field ${errors.password ? "invalid" : ""}`}>
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="At least 8 characters"
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      {...register("password", {
                        required: "Password is required.",
                        minLength: { value: 8, message: "Use at least 8 characters." }
                      })}
                    />
                    <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label="Toggle password visibility">
                      {showPassword ? <HiEyeSlash /> : <HiEye />}
                    </button>
                  </div>
                  {errors.password && <small>{errors.password.message}</small>}
                </label>

                <div className="auth-options">
                  <label className="check-label">
                    <input type="checkbox" {...register("remember")} />
                    <span className="custom-check"><HiCheck /></span>
                    Keep me signed in
                  </label>
                  {mode === "login" && <button type="button" className="text-link" onClick={() => setForgotOpen(true)}>Forgot password?</button>}
                </div>
                {serverError && <div className="form-error">{serverError}</div>}
                <button type="submit" className="primary-button auth-submit" disabled={isSubmitting}>
                  {isSubmitting ? <span className="button-spinner" /> : <>{mode === "login" ? "Sign in" : "Create account"} <HiArrowRight /></>}
                </button>
              </form>
              <div className="auth-divider"><span>or explore first</span></div>
              <button type="button" className="demo-button" onClick={enterDemo} disabled={demoLoading}>
                <img src="/lumina-mark.svg" alt="" />
                {demoLoading ? "Opening your demo…" : "Continue with demo workspace"}
              </button>
              <p className="auth-switch">
                {mode === "login" ? "New to Lumina?" : "Already have an account?"}{" "}
                <button type="button" onClick={() => switchMode(mode === "login" ? "register" : "login")}>
                  {mode === "login" ? "Create an account" : "Sign in"}
                </button>
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
        <ForgotPasswordDialog open={forgotOpen} onClose={() => setForgotOpen(false)} />
      </section>
    </main>
  );
}

function ForgotPasswordDialog({ open, onClose }) {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [developmentOtp, setDevelopmentOtp] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function close() {
    setStep("email");
    setEmail("");
    setOtp("");
    setPassword("");
    setConfirmPassword("");
    setDevelopmentOtp("");
    setMessage("");
    onClose();
  }

  async function sendOtp(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const result = await authApi.forgotPassword(email);
      setDevelopmentOtp(result.debugOtp || "");
      setStep("otp");
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not send the code.");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    if (password.length < 8) {
      setMessage("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("The password confirmation does not match.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      await authApi.verifyOtp({ email, otp, purpose: "reset", newPassword: password });
      setStep("done");
    } catch (error) {
      setMessage(error.response?.data?.message || "That code is invalid or expired.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Reset your password" size="sm" className="forgot-modal">
      {step === "email" && (
        <form onSubmit={sendOtp}>
          <p>Enter your account email and we’ll send a six-digit verification code.</p>
          <label><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus placeholder="you@example.com" /></label>
          {message && <div className="form-error">{message}</div>}
          <button className="primary-button" disabled={loading}>{loading ? "Sending…" : "Send verification code"}</button>
        </form>
      )}
      {step === "otp" && (
        <form onSubmit={resetPassword}>
          <p>We sent a code to <strong>{email}</strong>. It expires in ten minutes.</p>
          {developmentOtp && <div className="development-otp">Local development code: <strong>{developmentOtp}</strong></div>}
          <label><span>Verification code</span><input value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} required pattern="\d{6}" placeholder="000000" className="otp-input" autoFocus /></label>
          <label><span>New password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} placeholder="At least 8 characters" /></label>
          <label><span>Confirm new password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} placeholder="Repeat your new password" /></label>
          {message && <div className="form-error">{message}</div>}
          <button className="primary-button" disabled={loading || otp.length !== 6}>{loading ? "Updating…" : "Set new password"}</button>
        </form>
      )}
      {step === "done" && (
        <div className="reset-done"><span><HiCheck /></span><h3>Password updated</h3><p>You can now sign in with your new password.</p><button type="button" className="primary-button" onClick={close}>Back to sign in</button></div>
      )}
    </Modal>
  );
}
