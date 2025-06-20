const mediasoup = require("mediasoup");
const config = require("../config");
const os = require("os");

let workers = []
let nextWorkerIdx = 0

async function runWorkers(count = 2) {
    workers = await Promise.all(
        Array.from({length: count}, async (_, i) => {
            const worker = await mediasoup.createWorker(config.mediasoup.worker);
            console.log("mediasoup Worker ready, PID:", worker.pid);

            worker.on("died", () => {
                console.error("mediasoup Worker died, restarting in 2 s…");
                setTimeout(() => process.exit(1), 2000);
            });

            return worker;
        })
    )
}

function getNextWorker() {
    const worker = workers[nextWorkerIdx];
    nextWorkerIdx = (nextWorkerIdx + 1) % workers.length
    return worker
}

module.exports = {
    runWorkers, 
    getNextWorker
}