import { PoseLandmarker, HandLandmarker, FaceLandmarker, FilesetResolver, NormalizedLandmark, Category } from "@mediapipe/tasks-vision";

let poseLandmarker: PoseLandmarker | undefined = undefined;
let handLandmarker: HandLandmarker | undefined = undefined;
let faceLandmarker: FaceLandmarker | undefined = undefined;

const createPoseLandmarker = async (): Promise<PoseLandmarker> => {
    if (poseLandmarker) return poseLandmarker;

    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`,
            delegate: "GPU"
        },
        runningMode: "IMAGE",
        numPoses: 5, // Max poses
        outputSegmentationMasks: false,
    });
    return poseLandmarker;
};

const createHandLandmarker = async (): Promise<HandLandmarker> => {
    if (handLandmarker) return handLandmarker;
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
        },
        runningMode: "IMAGE",
        numHands: 10, // Increased to support multiple people
    });
    return handLandmarker;
};

const createFaceLandmarker = async (): Promise<FaceLandmarker> => {
    if (faceLandmarker) return faceLandmarker;
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
        },
        runningMode: "IMAGE",
        numFaces: 5,
    });
    return faceLandmarker;
};

export const detectPosesInImage = async (imageFile: File): Promise<{ 
    poseLandmarks: NormalizedLandmark[][]; 
    handLandmarks: NormalizedLandmark[][];
    handedness: Category[][];
    faceLandmarks: NormalizedLandmark[][];
    width: number; 
    height: number; 
}> => {
    const pLandmarker = await createPoseLandmarker();
    const hLandmarker = await createHandLandmarker();
    const fLandmarker = await createFaceLandmarker();

    const image = new Image();
    const objectUrl = URL.createObjectURL(imageFile);
    
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = reject;
        image.src = objectUrl;
    });
    
    URL.revokeObjectURL(objectUrl);
    
    const poseResults = pLandmarker.detect(image);
    const handResults = hLandmarker.detect(image);
    const faceResults = fLandmarker.detect(image);

    return { 
        poseLandmarks: poseResults.landmarks, 
        handLandmarks: handResults.landmarks,
        handedness: handResults.handedness,
        faceLandmarks: faceResults.faceLandmarks,
        width: image.naturalWidth, 
        height: image.naturalHeight 
    };
};
