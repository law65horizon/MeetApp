import { config } from './index';
import type { WorkerSettings, RouterOptions, WebRtcTransportOptions } from 'mediasoup/node/lib/types';
import os from 'os'
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const info of iface!) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return "127.0.0.1";
}

export const workerSettings: WorkerSettings = {
  logLevel: 'warn',
  logTags: ['ice', 'dtls'],
  // logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
  rtcMinPort: 10000,
  rtcMaxPort: 10100,
};

export const routerOptions: RouterOptions = {
  // mediaCodecs: [
  //   {
  //     kind: 'audio',
  //     mimeType: 'audio/opus',
  //     clockRate: 48000,
  //     channels: 2,
  //     parameters: {
  //       'sprop-stereo': 1,
  //       useinbandfec: 1,
  //       usedtx: 1,
  //       maxaveragebitrate: 128000,
  //     },
  //   },
  //   {
  //     kind: 'video',
  //     mimeType: 'video/VP8',
  //     clockRate: 90000,
  //     parameters: {
  //       'x-google-start-bitrate': 1000,
  //     },
  //   },
  //   {
  //     kind: 'video',
  //     mimeType: 'video/VP9',
  //     clockRate: 90000,
  //     parameters: {
  //       'profile-id': 2,
  //       'x-google-start-bitrate': 1000,
  //     },
  //   },
  //   {
  //     kind: 'video',
  //     mimeType: 'video/h264',
  //     clockRate: 90000,
  //     parameters: {
  //       'packetization-mode': 1,
  //       'profile-level-id': '4d0032',
  //       'level-asymmetry-allowed': 1,
  //       'x-google-start-bitrate': 1000,
  //     },
  //   },
  // ],
  mediaCodecs: [
      {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: { "x-google-start-bitrate": 1000 },
      },
      {
        kind: "video",
        mimeType: "video/H264",
        clockRate: 90000,
        parameters: {
          "packetization-mode": 1,
          "profile-level-id": "42e01f",
          "level-asymmetry-allowed": 1,
        },
      },
  ]
};

const announcedAddress = getLocalIp()
console.log({announcedAddress})

// config/mediasoup.ts
export const webRtcTransportOptions: WebRtcTransportOptions = {
  listenInfos: [
    { protocol: 'udp', ip: '0.0.0.0', announcedAddress: '192.168.1.173' },
    { protocol: 'tcp', ip: '0.0.0.0', announcedAddress: '192.168.1.173' },
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  initialAvailableOutgoingBitrate: 600_000,
};

// export const webRtcTransportOptions: WebRtcTransportOptions = {
//   listenInfos: [
//           { protocol: "udp", ip: "0.0.0.0", announcedAddress: '127.0.0.1' },
//           { protocol: "tcp", ip: "0.0.0.0", announcedAddress: '127.0.0.1' },
//         ],
//         enableUdp: true,
//         enableTcp: true,
//         preferUdp: true,
//         initialAvailableOutgoingBitrate: 600_000,
//   // listenInfos: [
//   //   {
//   //     protocol: 'udp',
//   //     ip: '0.0.0.0',
//   //     announcedAddress: config.ANNOUNCED_IP,
//   //   },
//   //   {
//   //     protocol: 'tcp',
//   //     ip: '0.0.0.0',
//   //     announcedAddress: config.ANNOUNCED_IP,
//   //   },
//   // ],
//   // enableUdp: true,
//   // enableTcp: true,
//   // preferUdp: true,
//   // initialAvailableOutgoingBitrate: 600_000,
//   // initialAvailableOutgoingBitrate: 800000,
//   // minimumAvailableOutgoingBitrate: 100000,
//   // maxSctpMessageSize: 262144,
//   // maxIncomingBitrate: 1500000,
// };

export function getIceServers() {
  const servers = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
        // Free TURN — good for dev / testing (1 GB / month, no auth needed)
        {
            urls: ["turn:freestun.net:3478"],
            username: "free",
            credential: "free",
        },
        // TLS variant to pierce strict firewalls
        {
            urls: ["turns:freestun.net:5349"],
            username: "free",
            credential: "free",
        },
  ]
  // const servers: any[] = [
  //   { urls: 'stun:stun.l.google.com:19302' },
  //   { urls: 'stun:stun1.l.google.com:19302' },
  //   { urls: ["turn:freestun.net:3478"], username: "free", credential: "free" },
  //   { urls: ["turns:freestun.net:5349"], username: "free", credential: "free" },
  // ];

  // if (config.TURN_URLS && config.TURN_USERNAME && config.TURN_CREDENTIAL) {
  //   servers.push({
  //     urls: config.TURN_URLS,
  //     username: config.TURN_USERNAME,
  //     credential: config.TURN_CREDENTIAL,
  //   });
  // }

  return servers;
}