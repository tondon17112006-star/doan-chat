// File: client/src/components/modals/CallOverlay.jsx
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
import { useAuthStore } from "../../store/authStore.js";
import { getSocket } from "../../services/socket.js";
import Avatar from "../common/Avatar.jsx";

export default function CallOverlay() {
  const call = useUiStore((state) => state.activeCall);
  const setCall = useUiStore((state) => state.setActiveCall);
  const user = useAuthStore((state) => state.user);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [connected, setConnected] = useState(false);
  const [sharing, setSharing] = useState(false);
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const localStream = useRef(null);
  const peer = useRef(null);

  useEffect(() => {
    if (!call) return undefined;
    const socket = getSocket();
    const target = call.incoming ? call.caller : call.peer;
    const createPeer = () => {
      if (peer.current) return peer.current;
      const connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      localStream.current?.getTracks().forEach((track) => connection.addTrack(track, localStream.current));
      connection.ontrack = (event) => {
        if (remoteVideo.current) remoteVideo.current.srcObject = event.streams[0];
        setConnected(true);
      };
      connection.onicecandidate = (event) => event.candidate && socket?.emit("webrtc:ice", { targetId: target?.id, candidate: event.candidate });
      peer.current = connection;
      return connection;
    };
    const prepareMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: call.type === "video" });
        localStream.current = stream;
        if (localVideo.current) localVideo.current.srcObject = stream;
      } catch {
        setCameraOff(true);
      }
    };
    prepareMedia();
    const accepted = async (payload) => {
      setConnected(true);
      const connection = createPeer();
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      socket.emit("webrtc:offer", { targetId: payload.user.id, offer });
    };
    const offer = async (payload) => {
      const connection = createPeer();
      await connection.setRemoteDescription(payload.offer);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      socket.emit("webrtc:answer", { targetId: payload.fromId, answer });
      setConnected(true);
    };
    const answer = async (payload) => {
      await peer.current?.setRemoteDescription(payload.answer);
      setConnected(true);
    };
    const ice = async (payload) => {
      if (payload.candidate && peer.current) await peer.current.addIceCandidate(payload.candidate);
    };
    const ended = () => end(false);
    socket?.on("call:accepted", accepted);
    socket?.on("webrtc:offer", offer);
    socket?.on("webrtc:answer", answer);
    socket?.on("webrtc:ice", ice);
    socket?.on("call:ended", ended);
    socket?.on("call:rejected", ended);
    return () => {
      socket?.off("call:accepted", accepted);
      socket?.off("webrtc:offer", offer);
      socket?.off("webrtc:answer", answer);
      socket?.off("webrtc:ice", ice);
      socket?.off("call:ended", ended);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.conversationId]);

  useEffect(() => {
    if (!call || !connected) return undefined;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1_000);
    return () => clearInterval(timer);
  }, [call, connected]);

  function accept() {
    setConnected(true);
    getSocket()?.emit("call:accept", { callerId: call.caller.id, conversationId: call.conversationId });
    setCall({ ...call, status: "connected" });
  }
  function end(notify = true) {
    if (notify) getSocket()?.emit("call:end", { conversationId: call.conversationId });
    localStream.current?.getTracks().forEach((track) => track.stop());
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
    } catch {
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
            {connected && call.type === "video" && !cameraOff ? <video ref={remoteVideo} className="remote-video" autoPlay playsInline /> : (
              <div className="call-person">
                <Avatar user={peerUser} name={peerUser?.username || "Lumina friend"} size="call" />
                <h2>{peerUser?.username || "Lumina friend"}</h2>
                <p>{connected ? formatDuration(seconds) : call.incoming ? `Incoming ${call.type} call…` : "Calling…"}</p>
              </div>
            )}
            {call.type === "video" && <video ref={localVideo} className={`local-video ${cameraOff ? "hidden" : ""}`} autoPlay muted playsInline />}
          </div>
          {call.incoming && !connected ? (
            <div className="incoming-call-actions">
              <button type="button" className="decline" onClick={() => { getSocket()?.emit("call:reject", { callerId: call.caller.id }); end(false); }}><HiPhoneXMark /><span>Decline</span></button>
              <button type="button" className="accept" onClick={accept}><HiPhone /><span>Accept</span></button>
            </div>
          ) : (
            <div className="call-controls">
              <button type="button" className={muted ? "off" : ""} onClick={toggleMute}>{muted ? <HiMicrophone /> : <HiMicrophone />}<span>{muted ? "Unmute" : "Mute"}</span></button>
              {call.type === "video" && <button type="button" className={cameraOff ? "off" : ""} onClick={toggleCamera}>{cameraOff ? <HiVideoCameraSlash /> : <HiOutlineVideoCamera />}<span>Camera</span></button>}
              <button type="button"><HiSpeakerWave /><span>Audio</span></button>
              <button type="button" className={sharing ? "active" : ""} onClick={shareScreen}><HiOutlineComputerDesktop /><span>Share</span></button>
              <button type="button" className="end-call" onClick={() => end()}><HiPhoneXMark /><span>End</span></button>
            </div>
          )}
          <div className="call-encryption">End-to-end encrypted</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const formatDuration = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
