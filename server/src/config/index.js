// require("dotenv")

module.exports = {
    port: 3000,
    nodeEnv: "development",

    mediasoup: {
        worker: {
            rtcMinPort: 10000,
            rtcMaxPort: 10100,
            logLevel: false ? "error" : "warn",
            logTags: ["ice", "dtls"],
        },
        router: {
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
        }
    },

    iceServers: [
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
}