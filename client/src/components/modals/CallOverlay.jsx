import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  HiMicrophone,
  HiOutlineComputerDesktop,
  HiOutlineVideoCamera,
  HiPhone,
  HiPhoneXMark,
  HiSpeakerWave,
  HiVideoCameraSlash
} from "react-icons/hi2";
import { useUiStore } from "../../store/uiStore.js";
import { getSocket } from "../../services/socket.js";
import Avatar from "../common/Avatar.jsx";

const DEFAULT_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

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
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const localStream = useRef(null);
  const peer = useRef(null);

  useEffect(() => {
    if (!call) return undefined;
    const socket = getSocket();
    const target = call.incoming ? call.caller : call.peer;
    let iceServers = DEFAULT_ICE_SERVERS;
    let disposed = false;
    setMuted(false);
    setCameraOff(false);
    setSeconds(0);
    setConnected(false);
    setSharing(false);
    setMediaReady(false);
    setMediaError("");

    socket?.emit("webrtc:config:request", (config) => {
      if (Array.isArray(config?.iceServers) && config.iceServers.length) iceServers = config.iceServers;
    });
    const config = (payload) => {
      if (Array.isArray(payload?.iceServers) && payload.iceServers.length) iceServers = payload.iceServers;
    };
    const createPeer = () => {
      if (peer.current) return peer.current;
      const connection = new RTCPeerConnection({ iceServers });
      localStream.current?.getTracks().forEach((track) => connection.addTrack(track, localStream.current));
      connection.ontrack = (event) => {
        if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0];
        setConnected(true);
      };
      connection.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(connection.connectionState)) setConnected(false);
      };
      connection.onicecandidate = (event) => event.candidate && socket?.emit("webrtc:ice", { callId: call.callId, conversationId: call.conversationId, targetId: target?.id, candidate: event.candidate });
      peer.current = connection;
      return connection;
    };
    const prepareMedia = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMediaError("This browser cannot access the microphone. Use HTTPS and a modern browser.");
        return false;
      }
      try {
        const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
        const stream = new MediaStream(audio.getAudioTracks());
        if (call.type === "video") {
          try {
            const video = await navigator.mediaDevices.getUserMedia({ video: true });
            video.getVideoTracks().forEach((track) => stream.addTrack(track));
          } catch (error) {
            setCameraOff(true);
            setMediaError(`${describeMediaError(error, "camera")} You can continue with audio only.`);
          }
        }
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return false;
        }
        localStream.current = stream;
        if (localVideo.current) localVideo.current.srcObject = stream;
        setMediaReady(true);
        return true;
      } catch (error) {
        setMediaError(describeMediaError(error, "microphone"));
        return false;
      }
    };
    const mediaPromise = prepareMedia();
    void mediaPromise.then((ready) => {
      if (!ready && !call.incoming && !disposed) end(false, call);
      if (ready && !call.incoming && !disposed) {
        socket?.emit("call:start", call, (result) => {
          if (!result?.ok && !disposed) {
            setMediaError(result?.error || "Unable to start the call.");
            setTimeout(() => !disposed && end(false, call), 1_500);
          }
        });
      }
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
    const answer = async (payload) => {
      if (payload.callId !== call.callId) return;
      await peer.current?.setRemoteDescription(payload.answer);
      setConnected(true);
    };
    const ice = async (payload) => {
      if (payload.callId !== call.callId || !payload.candidate || !peer.current) return;
      await peer.current.addIceCandidate(payload.candidate);
    };
    const ended = (payload = {}) => {
      if (!payload.callId || payload.callId === call.callId) end(false, call);
    };
    socket?.on("webrtc:config", config);
    socket?.on("call:accepted", accepted);
    socket?.on("webrtc:offer", offer);
    socket?.on("webrtc:answer", answer);
    socket?.on("webrtc:ice", ice);
    socket?.on("call:ended", ended);
    socket?.on("call:rejected", ended);
    socket?.on("call:timeout", ended);
    socket?.on("call:unavailable", ended);
    return () => {
      disposed = true;
      socket?.off("webrtc:config", config);
      socket?.off("call:accepted", accepted);
      socket?.off("webrtc:offer", offer);
      socket?.off("webrtc:answer", answer);
      socket?.off("webrtc:ice", ice);
      socket?.off("call:ended", ended);
      socket?.off("call:rejected", ended);
      socket?.off("call:timeout", ended);
      socket?.off("call:unavailable", ended);
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
    if (!mediaReady) {
      setMediaError(mediaError || "Waiting for microphone access before accepting the call.");
      return;
    }
    setConnected(true);
    getSocket()?.emit("call:accept", { callId: call.callId, callerId: call.caller.id, conversationId: call.conversationId });
    setCall({ ...call, incoming: false, peer: call.caller, status: "connected" });
  }
  function end(notify = true, activeCall = call) {
    if (notify && activeCall) getSocket()?.emit("call:end", { callId: activeCall.callId, conversationId: activeCall.conversationId });
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
    peer.current?.close();
    peer.current = null;
    setSeconds(0);
    setConnected(false);
    setCall(null);
  }
  function toggleMute() {
    localStream.current?.getAudioTracks().forEach((track) => { track.enabled = muted; });
    setMuted(!muted);
  }
  function toggleCamera() {
    localStream.current?.getVideoTracks().forEach((track) => { track.enabled = cameraOff; });
    setCameraOff(!cameraOff);
  }
  async function shareScreen() {
    if (sharing) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaError("Screen sharing is not supported by this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const sender = peer.current?.getSenders().find((item) => item.track?.kind === "video");
      if (sender) await sender.replaceTrack(track);
      track.onended = async () => {
        const camera = localStream.current?.getVideoTracks()[0];
        if (sender && camera) await sender.replaceTrack(camera);
        setSharing(false);
      };
      setSharing(true);
    } catch (error) {
      setMediaError(describeMediaError(error, "screen"));
      setSharing(false);
    }
  }

  const peerUser = call?.incoming ? call?.caller : call?.peer;
  return (
    <AnimatePresence>
      {call && (
        <motion.div className="call-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="call-ambient" />
          <div className="call-stage">
            {connected && call.type === "video" ? <video ref={remoteVideo} className="remote-video" autoPlay playsInline /> : (
              <div className="call-person">
                <Avatar user={peerUser} name={peerUser?.username || "Lumina friend"} size="call" />
                <h2>{peerUser?.username || "Lumina friend"}</h2>
                <p>{connected ? formatDuration(seconds) : call.incoming ? `Incoming ${call.type} call…` : "Calling…"}</p>
                {mediaError && <small className="call-media-error" role="alert">{mediaError}</small>}
              </div>
            )}
            {call.type === "video" && <video ref={localVideo} className={`local-video ${cameraOff ? "hidden" : ""}`} autoPlay muted playsInline />}
          </div>
          {call.incoming && !connected ? (
            <div className="incoming-call-actions">
              <button type="button" className="decline" onClick={() => { getSocket()?.emit("call:reject", { callId: call.callId, callerId: call.caller.id, conversationId: call.conversationId }); end(false); }}><HiPhoneXMark /><span>Decline</span></button>
              <button type="button" className="accept" onClick={accept} disabled={!mediaReady}><HiPhone /><span>{mediaReady ? "Accept" : "Preparing…"}</span></button>
            </div>
          ) : (
            <div className="call-controls">
              <button type="button" className={muted ? "off" : ""} onClick={toggleMute} disabled={!mediaReady}>{muted ? <HiMicrophone /> : <HiMicrophone />}<span>{muted ? "Unmute" : "Mute"}</span></button>
              {call.type === "video" && <button type="button" className={cameraOff ? "off" : ""} onClick={toggleCamera} disabled={!mediaReady || cameraOff && !localStream.current?.getVideoTracks().length}>{cameraOff ? <HiVideoCameraSlash /> : <HiOutlineVideoCamera />}<span>Camera</span></button>}
              <button type="button" disabled><HiSpeakerWave /><span>Audio</span></button>
              <button type="button" className={sharing ? "active" : ""} onClick={shareScreen} disabled={!connected}><HiOutlineComputerDesktop /><span>Share</span></button>
              <button type="button" className="end-call" onClick={() => end()}><HiPhoneXMark /><span>End</span></button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function describeMediaError(error, device) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") return `Permission for the ${device} was denied. Check browser permissions and use HTTPS.`;
  if (error?.name === "NotFoundError") return `No ${device} was found. Connect one and try again.`;
  if (error?.name === "NotReadableError") return `The ${device} is busy in another application.`;
  return `Unable to access the ${device}. Please try again.`;
}

const formatDuration = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
