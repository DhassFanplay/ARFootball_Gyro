const detectorPromise = (async () => {
    console.log("[DEBUG] Initializing MoveNet detector...");
    await tf.setBackend("webgl");
    await tf.ready();
    const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER
    });
    console.log("[DEBUG] Detector ready.");
    return detector;
})();
function logDebug(message) {
    const log = document.getElementById("debugLog");
    if (log) {
        log.innerText = `[${new Date().toLocaleTimeString()}] ${message}\n` + log.innerText;
    }
}

function handleMotion(event) {
    const acc = event.accelerationIncludingGravity;
    const rot = event.rotationRate;

    const data = {
        ax: acc?.x ?? 0,
        ay: acc?.y ?? 0,
        az: acc?.z ?? 0,
        alpha: rot?.alpha ?? 0,
        beta: rot?.beta ?? 0,
        gamma: rot?.gamma ?? 0
    };

    logDebug(`Accel: x=${data.ax.toFixed(2)}, y=${data.ay.toFixed(2)}, z=${data.az.toFixed(2)} | Rotation: α=${data.alpha.toFixed(2)}, β=${data.beta.toFixed(2)}, γ=${data.gamma.toFixed(2)}`);

    if (window.unityInstance) {
        window.unityInstance.SendMessage("GyroReceiver", "OnGyroData", JSON.stringify(data));
    }
}

function setupGyro() {
    if (typeof DeviceMotionEvent?.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(response => {
                if (response === 'granted') {
                    window.addEventListener('devicemotion', handleMotion, true);
                    logDebug("Gyroscope permission granted and listener active.");
                } else {
                    logDebug("Gyroscope permission denied.");
                }
            })
            .catch(err => {
                logDebug("Error requesting gyro permission: " + err);
            });
    } else {
        // Older Android or desktop
        window.addEventListener('devicemotion', handleMotion, true);
        logDebug("Gyroscope listener added (no permission required).");
    }
}

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
window.addEventListener('load', () => {
    setupGyro();
});
window.ReceiveWebcamFrame = async (base64) => {
    const detector = await detectorPromise;

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = "data:image/jpeg;base64," + base64;

    image.onload = async () => {
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);

        console.log("[DEBUG] Image loaded. Estimating poses...");
        const poses = await detector.estimatePoses(canvas);
        if (poses.length === 0) {
            console.warn("[DEBUG] No poses detected.");
            return;
        }

        const keypoints = poses[0].keypoints;

        console.log("[DEBUG] Keypoints received:", keypoints);

        const leftAnkle = keypoints[15];  // left ankle index
        const rightAnkle = keypoints[16]; // right ankle index

        console.log("[DEBUG] Left Ankle:", leftAnkle);
        console.log("[DEBUG] Right Ankle:", rightAnkle);

        const foot = (leftAnkle?.score ?? 0) > (rightAnkle?.score ?? 0) ? leftAnkle : rightAnkle;

        if (foot && foot.score > 0.3) {
            const normalized = {
                x: foot.x / canvas.width,
                y: foot.y / canvas.height
            };
            console.log("[DEBUG] Sending foot position to Unity:", normalized);
            if (window.unityInstance) {
                window.unityInstance.SendMessage("FootCube", "OnReceiveFootPosition", JSON.stringify(normalized));
            } else {
                console.warn("[DEBUG] Unity instance not found.");
            }
        } else {
            console.log("[DEBUG] Foot score too low or undefined.");
        }
    };
};