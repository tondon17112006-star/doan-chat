import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HiMicrophone, HiOutlineComputerDesktop, HiOutlineVideoCamera, HiPhone, HiPhoneXMark, HiVideoCameraSlash } from "react-icons/hi2";
import { useUiStore } from "../../store/uiStore.js";
import { getSocket } from "../../services/socket.js";
import Avatar from "../common/Avatar.jsx";

const DEFAULT_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const emptyDevices = { audioInputs: [], videoInputs: [], audioOutputs: [] };

export default function CallOverlay() {
  const call = useUiStore((state) => state.activeCall);
  const setCall = useUiStore((state) => state.setActiveCall);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [connected, setConnected] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [networkWarning, setNetworkWarning] = useState("");
  const [devices, setDevices] = useState(emptyDevices);
  const [selectedDevices, setSelectedDevices] = useState({ audioInput: "", videoInput: "", audioOutput: "" });
  const [switchingDevice, setSwitchingDevice] = useState(false);
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const remoteAudio = useRef(null);
  const localStream = useRef(null);
  const peer = useRef(null);
  const mediaActions = useRef(null);
  const selectedDevicesRef = useRef(selectedDevices);
  const disconnectTimer = useRef(null);

  useEffect(() => {
    selectedDevicesRef.current = selectedDevices;
  }, [selectedDevices]);

  useEffect(() => {
    if (!call) return undefined;
    const socket = getSocket();
    const target = call.incoming ? call.caller : call.peer;
    let iceServers = DEFAULT_ICE_SERVERS;
    let disposed = false;
    setMuted(false); setCameraOff(false); setSeconds(0); setConnected(false); setSharing(false); setMediaReady(false); setMediaError(""); setNetworkWarning(""); setDevices(emptyDevices); setSelectedDevices({ audioInput: "", videoInput: "", audioOutput: "" });

    const applyWebRtcConfig = (payload) => {
      if (Array.isArray(payload?.iceServers) && payload.iceServers.length) iceServers = payload.iceServers;
      const hasTurn = payload?.turnConfigured === true || iceServers.some((server) => urlsIncludeTurn(server?.urls));
      if (!hasTurn) setNetworkWarning("TURN relay is not configured. Calls may fail on restrictive networks.");
    };
    socket?.emit("webrtc:config:request", (config) => applyWebRtcConfig(config));
    const config = (payload) => applyWebRtcConfig(payload);
    const createPeer = () => {
      if (peer.current) return peer.current;
      const connection = new RTCPeerConnection({ iceServers });
      localStream.current?.getTracks().forEach((track) => connection.addTrack(track, localStream.current));
      connection.ontrack = (event) => {
        const stream = event.streams[0];
        if (remoteVideo.current) remoteVideo.current.srcObject = stream;
        if (remoteAudio.current) remoteAudio.current.srcObject = stream;
        setConnected(true);
      };
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "failed") {
          setMediaError("The call connection failed. Check your network or TURN relay availability.");
          end(true, call);
        }
        if (connection.connectionState === "disconnected") {
          setMediaError("The call connection was interrupted. Reconnecting…");
          clearTimeout(disconnectTimer.current);
          disconnectTimer.current = setTimeout(() => {
            if (connection.connectionState === "disconnected") {
              setMediaError("The call connection was lost.");
              end(true, call);
            }
          }, 4_000);
        }
        if (connection.connectionState === "connected") clearTimeout(disconnectTimer.current);
      };
      connection.oniceconnectionstatechange = () => {
        if (connection.iceConnectionState === "failed") setMediaError("Unable to establish a media route. TURN may be unavailable on this network.");
      };
      connection.onicecandidate = (event) => event.candidate && socket?.emit("webrtc:ice", { callId: call.callId, conversationId: call.conversationId, targetId: target?.id, candidate: event.candidate });
      peer.current = connection;
      return connection;
    };
    const listDevices = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const entries = await navigator.mediaDevices.enumerateDevices();
        if (disposed) return;
        const available = { audioInputs: entries.filter((item) => item.kind === "audioinput"), videoInputs: entries.filter((item) => item.kind === "videoinput"), audioOutputs: entries.filter((item) => item.kind === "audiooutput") };
        setDevices(available);
        setSelectedDevices((current) => ({ audioInput: current.audioInput || available.audioInputs[0]?.deviceId || "", videoInput: current.videoInput || available.videoInputs[0]?.deviceId || "", audioOutput: current.audioOutput || available.audioOutputs[0]?.deviceId || "" }));
        if (!available.audioInputs.length) setMediaError("No microphone was found. Connect one and try again.");
        else if (call.type === "video" && !available.videoInputs.length) setMediaError("No camera was found. You can continue with audio only.");
      } catch {
        if (!disposed) setMediaError("Unable to list media devices. Check your browser permissions.");
      }
    };
    const replacePeerTracks = async (stream) => {
      const connection = peer.current;
      if (!connection) return;
      for (const kind of ["audio", "video"]) {
        const track = stream.getTracks().find((item) => item.kind === kind) || null;
        const sender = connection.getSenders().find((item) => item.track?.kind === kind);
        if (sender) await sender.replaceTrack(track);
        else if (track) connection.addTrack(track, stream);
      }
    };
    const prepareMedia = async (selection = selectedDevicesRef.current) => {
      const prerequisite = mediaPrerequisiteError();
      if (prerequisite) { setMediaError(prerequisite); return false; }
      let audio;
      try {
        audio = await navigator.mediaDevices.getUserMedia({ audio: deviceConstraint(selection.audioInput) });
      } catch (error) {
        setMediaError(describeMediaError(error, "microphone"));
        return false;
      }
      const stream = new MediaStream(audio.getAudioTracks());
      if (call.type === "video") {
        try {
          const video = await navigator.mediaDevices.getUserMedia({ video: deviceConstraint(selection.videoInput) });
          video.getVideoTracks().forEach((track) => stream.addTrack(track));
          setCameraOff(false);
        } catch (error) {
          setCameraOff(true);
          setMediaError(`${describeMediaError(error, "camera")} You can continue with audio only.`);
        }
      }
      if (disposed) { stream.getTracks().forEach((track) => track.stop()); return false; }
      try {
        await replacePeerTracks(stream);
        const previous = localStream.current;
        localStream.current = stream;
        if (localVideo.current) localVideo.current.srcObject = stream;
        previous?.getTracks().forEach((track) => track.stop());
        setMediaReady(true);
        await listDevices();
        return true;
      } catch {
        stream.getTracks().forEach((track) => track.stop());
        setMediaError("Could not switch the media device during this call.");
        return false;
      }
    };
    const switchInput = async (kind, deviceId) => {
      setSwitchingDevice(true); setMediaError("");
      const next = { ...selectedDevicesRef.current, [kind]: deviceId };
      const ready = await prepareMedia(next);
      if (ready && !disposed) setSelectedDevices(next);
      if (!disposed) setSwitchingDevice(false);
    };
    const switchOutput = async (deviceId) => {
      const audio = remoteAudio.current;
      if (!audio || typeof audio.setSinkId !== "function") return setMediaError("Selecting an audio output is not supported by this browser.");
      setSwitchingDevice(true);
      try {
        await audio.setSinkId(deviceId);
        if (!disposed) setSelectedDevices((current) => ({ ...current, audioOutput: deviceId }));
      } catch {
        if (!disposed) setMediaError("Unable to switch the audio output. Check browser permissions for this device.");
      } finally {
        if (!disposed) setSwitchingDevice(false);
      }
    };
    mediaActions.current = { switchInput, switchOutput };
    navigator.mediaDevices?.addEventListener?.("devicechange", listDevices);
    void listDevices();
    const mediaPromise = prepareMedia();
    void mediaPromise.then((ready) => {
      if (!ready && !call.incoming && !disposed) end(false, call);
      if (ready && !call.incoming && !disposed) socket?.emit("call:start", call, (result) => {
        if (!result?.ok && !disposed) {
          setMediaError(result?.error || "Unable to start the call.");
          setTimeout(() => !disposed && end(false, call), 1_500);
        }
      });
    });
    const accepted = async (payload) => {
      if (payload.callId !== call.callId || !(await mediaPromise)) return;
      setConnected(true);
      const connection = createPeer();
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      socket?.emit("webrtc:offer", { callId: call.callId, conversationId: call.conversationId, targetId: payload.user.id, offer });
    };
    const offer = async (payload) => {
      if (payload.callId !== call.callId) return;
      const connection = createPeer();
      await connection.setRemoteDescription(payload.offer);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      socket?.emit("webrtc:answer", { callId: call.callId, conversationId: call.conversationId, targetId: payload.fromId, answer });
      setConnected(true);
    };
    const answer = async (payload) => { if (payload.callId === call.callId) { await peer.current?.setRemoteDescription(payload.answer); setConnected(true); } };
    const ice = async (payload) => { if (payload.callId === call.callId && payload.candidate && peer.current) await peer.current.addIceCandidate(payload.candidate); };
    const ended = (payload = {}) => { if (!payload.callId || payload.callId === call.callId) end(false, call); };
    socket?.on("webrtc:config", config); socket?.on("call:accepted", accepted); socket?.on("webrtc:offer", offer); socket?.on("webrtc:answer", answer); socket?.on("webrtc:ice", ice); socket?.on("call:ended", ended); socket?.on("call:rejected", ended); socket?.on("call:timeout", ended); socket?.on("call:unavailable", ended);
    return () => {
      disposed = true; clearTimeout(disconnectTimer.current); navigator.mediaDevices?.removeEventListener?.("devicechange", listDevices); mediaActions.current = null;
      socket?.off("webrtc:config", config); socket?.off("call:accepted", accepted); socket?.off("webrtc:offer", offer); socket?.off("webrtc:answer", answer); socket?.off("webrtc:ice", ice); socket?.off("call:ended", ended); socket?.off("call:rejected", ended); socket?.off("call:timeout", ended); socket?.off("call:unavailable", ended);
    };
  // The call id identifies a complete call lifecycle; state values are intentionally handled by listeners.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.callId]);

  useEffect(() => {
    if (!call || !connected) return undefined;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1_000);
    return () => clearInterval(timer);
  }, [call, connected]);

  function accept() {
    if (!mediaReady) return setMediaError(mediaError || "Waiting for microphone access before accepting the call.");
    setConnected(true);
    getSocket()?.emit("call:accept", { callId: call.callId, callerId: call.caller.id, conversationId: call.conversationId });
    setCall({ ...call, incoming: false, peer: call.caller, status: "connected" });
  }
  function end(notify = true, activeCall = call) {
    if (notify && activeCall) getSocket()?.emit("call:end", { callId: activeCall.callId, conversationId: activeCall.conversationId });
    clearTimeout(disconnectTimer.current); localStream.current?.getTracks().forEach((track) => track.stop()); localStream.current = null; peer.current?.close(); peer.current = null; setSeconds(0); setConnected(false); setCall(null);
  }
  function toggleMute() { localStream.current?.getAudioTracks().forEach((track) => { track.enabled = muted; }); setMuted(!muted); }
  function toggleCamera() { localStream.current?.getVideoTracks().forEach((track) => { track.enabled = cameraOff; }); setCameraOff(!cameraOff); }
  async function shareScreen() {
    if (sharing) return;
    if (!navigator.mediaDevices?.getDisplayMedia) return setMediaError("Screen sharing is not supported by this browser.");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const sender = peer.current?.getSenders().find((item) => item.track?.kind === "video");
      if (sender) await sender.replaceTrack(track);
      track.onended = async () => { const camera = localStream.current?.getVideoTracks()[0]; if (sender && camera) await sender.replaceTrack(camera); setSharing(false); };
      setSharing(true);
    } catch (error) { setMediaError(describeMediaError(error, "screen")); setSharing(false); }
  }

  const peerUser = call?.incoming ? call?.caller : call?.peer;
  const supportsOutputSelection = typeof remoteAudio.current?.setSinkId === "function" || typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
  return <AnimatePresence>{call && <motion.div className="call-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <div className="call-ambient" />
    <div className="call-stage">
      {connected && call.type === "video" ? <video ref={remoteVideo} className="remote-video" autoPlay playsInline /> : <div className="call-person"><Avatar user={peerUser} name={peerUser?.username || "Lumina friend"} size="call" /><h2>{peerUser?.username || "Lumina friend"}</h2><p>{connected ? formatDuration(seconds) : call.incoming ? `Incoming ${call.type} call…` : "Calling…"}</p></div>}
      <audio ref={remoteAudio} autoPlay />
      {call.type === "video" && <video ref={localVideo} className={`local-video ${cameraOff ? "hidden" : ""}`} autoPlay muted playsInline />}
      {(mediaError || networkWarning) && <div className="call-media-status">{mediaError && <small className="call-media-error" role="alert">{mediaError}</small>}{networkWarning && <small className="call-media-warning">{networkWarning}</small>}</div>}
    </div>
    {mediaReady && <DeviceControls devices={devices} selected={selectedDevices} video={call.type === "video"} supportsOutputSelection={supportsOutputSelection} pending={switchingDevice} onInputChange={(kind, deviceId) => mediaActions.current?.switchInput(kind, deviceId)} onOutputChange={(deviceId) => mediaActions.current?.switchOutput(deviceId)} />}
    {call.incoming && !connected ? <div className="incoming-call-actions"><button type="button" className="decline" onClick={() => { getSocket()?.emit("call:reject", { callId: call.callId, callerId: call.caller.id, conversationId: call.conversationId }); end(false); }}><HiPhoneXMark /><span>Decline</span></button><button type="button" className="accept" onClick={accept} disabled={!mediaReady}><HiPhone /><span>{mediaReady ? "Accept" : "Preparing…"}</span></button></div> : <div className="call-controls"><button type="button" className={muted ? "off" : ""} onClick={toggleMute} disabled={!mediaReady}><HiMicrophone /><span>{muted ? "Unmute" : "Mute"}</span></button>{call.type === "video" && <button type="button" className={cameraOff ? "off" : ""} onClick={toggleCamera} disabled={!mediaReady || cameraOff && !localStream.current?.getVideoTracks().length}>{cameraOff ? <HiVideoCameraSlash /> : <HiOutlineVideoCamera />}<span>Camera</span></button>}<button type="button" className={sharing ? "active" : ""} onClick={shareScreen} disabled={!connected}><HiOutlineComputerDesktop /><span>Share</span></button><button type="button" className="end-call" onClick={() => end()}><HiPhoneXMark /><span>End</span></button></div>}
  </motion.div>}</AnimatePresence>;
}

function DeviceControls({ devices, selected, video, supportsOutputSelection, pending, onInputChange, onOutputChange }) {
  const hasInputs = devices.audioInputs.length || video && devices.videoInputs.length || supportsOutputSelection && devices.audioOutputs.length;
  if (!hasInputs) return null;
  return <div className="call-device-controls" aria-label="Call devices">
    {devices.audioInputs.length > 0 && <DeviceSelect label="Microphone" value={selected.audioInput} devices={devices.audioInputs} pending={pending} onChange={(value) => onInputChange("audioInput", value)} />}
    {video && devices.videoInputs.length > 0 && <DeviceSelect label="Camera" value={selected.videoInput} devices={devices.videoInputs} pending={pending} onChange={(value) => onInputChange("videoInput", value)} />}
    {supportsOutputSelection && devices.audioOutputs.length > 0 && <DeviceSelect label="Speaker" value={selected.audioOutput} devices={devices.audioOutputs} pending={pending} onChange={onOutputChange} />}
  </div>;
}

function DeviceSelect({ label, value, devices, pending, onChange }) {
  return <label><span>{label}</span><select value={value} disabled={pending} onChange={(event) => onChange(event.target.value)}>{devices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `${label} ${index + 1}`}</option>)}</select></label>;
}

function mediaPrerequisiteError() {
  if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") return "Microphone and camera access requires HTTPS. Open Lumina over a secure connection.";
  if (!navigator.mediaDevices?.getUserMedia) return "This browser cannot access the microphone or camera. Use HTTPS and a modern browser.";
  return "";
}
function deviceConstraint(deviceId) { return deviceId ? { deviceId: { exact: deviceId } } : true; }
function urlsIncludeTurn(urls) { return (Array.isArray(urls) ? urls : [urls]).some((url) => String(url || "").startsWith("turn:")); }
function describeMediaError(error, device) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") return `Permission for the ${device} was denied. Check browser permissions and use HTTPS.`;
  if (error?.name === "NotFoundError" || error?.name === "OverconstrainedError") return `No compatible ${device} was found. Connect one and try again.`;
  if (error?.name === "NotReadableError") return `The ${device} is busy in another application.`;
  return `Unable to access the ${device}. Please try again.`;
}
const formatDuration = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
