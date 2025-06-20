const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mediasoup = require("mediasoup");
const os = require("os");

const config = require("./config");
const { runWorkers } = require("./mediasoup/workerManager");
const socketHandlers = require("./socket/handlers"); 


const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.static("public"));

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

(async () => {
  try {
    const worker = await runWorkers();
  
    io.on("connection", (socket) => {
      console.log("Client connected:", socket.id);
      socketHandlers(socket);
    });
  
    server.listen(config.port, () => {
      console.log(`Server listening on port ${config.port} [env:${config.nodeEnv}]`);
    });
  } catch (error) {
    console.log('startup failed', error)
    process.exit(1)
  }
})();