import { PoseLandmarker, HandLandmarker, FaceLandmarker, FilesetResolver, NormalizedLandmark, Category } from "@mediapipe/tasks-vision";

let poseLandmarker: PoseLandmarker | undefined = undefined;
let handLandmarker: HandLandmarker | undefined = undefined;
let faceLandmarker: FaceLandmarker | undefined = undefined;

const createPoseLandmarker = async (): Promise<PoseLandmarker> => {
    if (poseLandmarker) return poseLandmarker;

    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`,
                delegate: "CPU"
            },
            runningMode: "IMAGE",
            numPoses: 5,
            minPoseDetectionConfidence: 0.3,
            minPosePresenceConfidence: 0.3,
            minTrackingConfidence: 0.3,
            outputSegmentationMasks: false,
        });
        return poseLandmarker;
    } catch (e) {
        console.error("Failed to initialize PoseLandmarker:", e);
        throw new Error("Failed to initialize AI models. Please check your internet connection.");
    }
};

const createHandLandmarker = async (): Promise<HandLandmarker> => {
    if (handLandmarker) return handLandmarker;
    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "CPU"
            },
            runningMode: "IMAGE",
            numHands: 10,
            minHandDetectionConfidence: 0.3,
            minHandPresenceConfidence: 0.3,
            minTrackingConfidence: 0.3,
        });
        return handLandmarker;
    } catch (e) {
        console.error("Failed to initialize HandLandmarker:", e);
        throw new Error("Failed to initialize Hand model.");
    }
};

const createFaceLandmarker = async (): Promise<FaceLandmarker> => {
    if (faceLandmarker) return faceLandmarker;
    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                delegate: "CPU"
            },
            runningMode: "IMAGE",
            numFaces: 5,
            minFaceDetectionConfidence: 0.3,
            minFacePresenceConfidence: 0.3,
            minTrackingConfidence: 0.3,
        });
        return faceLandmarker;
    } catch (e) {
        console.error("Failed to initialize FaceLandmarker:", e);
        throw new Error("Failed to initialize Face model.");
    }
};

const withTimeout = <T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
    ]);
};

export const detectPosesInImage = async (imageFile: File): Promise<{ 
    poseLandmarks: NormalizedLandmark[][]; 
    handLandmarks: NormalizedLandmark[][];
    handedness: Category[][];
    faceLandmarks: NormalizedLandmark[][];
    width: number; 
    height: number; 
}> => {
    try {
        // Initialize models in parallel to save time, but catch errors individually if needed
        const [pLandmarker, hLandmarker, fLandmarker] = await Promise.all([
            createPoseLandmarker(),
            createHandLandmarker(),
            createFaceLandmarker()
        ]);

        const image = new Image();
        const objectUrl = URL.createObjectURL(imageFile);
        
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = (err) => reject(new Error("Failed to load image for pose detection: " + err));
            image.src = objectUrl;
        });
        
        URL.revokeObjectURL(objectUrl);
        
        // Run detection with a timeout to prevent hanging (which causes the "INFO..." log to be the last thing user sees)
        const timeoutMs = 15000; // 15 seconds timeout
        
        const poseResults = await withTimeout(
            Promise.resolve(pLandmarker.detect(image)), 
            timeoutMs, 
            "Pose detection timed out. The AI model is taking too long."
        );
        
        const handResults = await withTimeout(
            Promise.resolve(hLandmarker.detect(image)), 
            timeoutMs,
            "Hand detection timed out."
        );
        
        const faceResults = await withTimeout(
            Promise.resolve(fLandmarker.detect(image)),
            timeoutMs,
            "Face detection timed out."
        );

        return { 
            poseLandmarks: poseResults.landmarks, 
            handLandmarks: handResults.landmarks,
            handedness: handResults.handedness,
            faceLandmarks: faceResults.faceLandmarks,
            width: image.naturalWidth, 
            height: image.naturalHeight 
        };
    } catch (error: any) {
        console.error("Pose Detection Error:", error);
        // Re-throw with a user-friendly message if possible
        throw new Error(error.message || "An error occurred during pose detection.");
    }
};