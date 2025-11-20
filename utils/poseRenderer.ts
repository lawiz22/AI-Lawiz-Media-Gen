
// MediaPipe landmark indices (BlazePose model)
// These are normalized [0,1] coordinates.
const MP = {
    NOSE: 0,
    LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3,
    RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6,
    LEFT_EAR: 7, RIGHT_EAR: 8,
    MOUTH_LEFT: 9, MOUTH_RIGHT: 10,
    LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
    LEFT_WRIST: 15, RIGHT_WRIST: 16,
    LEFT_PINKY: 17, RIGHT_PINKY: 18,
    LEFT_INDEX: 19, RIGHT_INDEX: 20,
    LEFT_THUMB: 21, RIGHT_THUMB: 22,
    LEFT_HIP: 23, RIGHT_HIP: 24,
    LEFT_KNEE: 25, RIGHT_KNEE: 26,
    LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
    LEFT_HEEL: 29, RIGHT_HEEL: 30,
    LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32
};

// OpenPose COCO Body 18 keypoints
const OP = {
    Nose: 0, Neck: 1, RShoulder: 2, RElbow: 3, RWrist: 4, LShoulder: 5, LElbow: 6, LWrist: 7,
    RHip: 8, RKnee: 9, RAnkle: 10, LHip: 11, LKnee: 12, LAnkle: 13, REye: 14, LEye: 15,
    REar: 16, LEar: 17
};

// Mapping specific MediaPipe Face Mesh indices (468 points) to OpenPose Face (70 points)
const MP_FACE_TO_OP_70 = [
    // Jawline (0-16)
    234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397,
    // Right Eyebrow (17-21)
    70, 63, 105, 66, 107,
    // Left Eyebrow (22-26)
    336, 296, 334, 293, 300,
    // Nose Bridge (27-30)
    168, 6, 197, 195,
    // Nose Base (31-35)
    5, 4, 1, 19, 94,
    // Right Eye (36-41)
    33, 160, 158, 133, 153, 144,
    // Left Eye (42-47)
    362, 385, 387, 263, 373, 380,
    // Outer Mouth (48-59)
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 185,
    // Inner Mouth (60-67)
    78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415,
    // Pupils (68-69) - MP 468 and 473 are iris centers
    468, 473
];

// Color Palette for Rendering (OpenPose style)
const COLORS = {
    body: [
        'rgb(255, 0, 0)', 'rgb(255, 85, 0)', 'rgb(255, 170, 0)', 'rgb(255, 255, 0)', 
        'rgb(170, 255, 0)', 'rgb(85, 255, 0)', 'rgb(0, 255, 0)', 'rgb(0, 255, 85)', 
        'rgb(0, 255, 170)', 'rgb(0, 255, 255)', 'rgb(0, 170, 255)', 'rgb(0, 85, 255)', 
        'rgb(0, 0, 255)', 'rgb(85, 0, 255)', 'rgb(170, 0, 255)', 'rgb(255, 0, 255)', 
        'rgb(255, 0, 170)', 'rgb(255, 0, 85)'
    ],
    hand: 'rgb(0, 255, 0)',
    face: 'rgb(255, 255, 255)' // Face points typically white in ControlNet preprocessor views
};

// OpenPose COCO Connection pairs
const BODY_CONNECTIONS = [
    [1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 8], [8, 9], [9, 10], 
    [1, 11], [11, 12], [12, 13], [1, 0], [0, 14], [14, 16], [0, 15], [15, 17]
];

// Hand connections (Thumb -> Pinky)
const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8], // Index
    [0, 9], [9, 10], [10, 11], [11, 12], // Middle
    [0, 13], [13, 14], [14, 15], [15, 16], // Ring
    [0, 17], [17, 18], [18, 19], [19, 20]  // Pinky
];

export const mediaPipeToOpenPose = (
    bodyLandmarksForPerson: any[],
    allHandLandmarks: any[][],
    allHandedness: any[][],
    faceLandmarksForPerson: any[] | undefined,
    width: number,
    height: number
) => {
    // 1. BODY KEYPOINTS (COCO 18)
    // Format: [x1, y1, c1, x2, y2, c2, ...]
    const poseKeypoints2d = new Array(18 * 3).fill(0);

    const getPoint = (idx: number) => bodyLandmarksForPerson[idx] || { x: 0, y: 0, visibility: 0 };
    const setKeypoint = (opIdx: number, point: any) => {
        if (point.visibility > 0.3) { // Threshold check
            poseKeypoints2d[opIdx * 3] = point.x * width;
            poseKeypoints2d[opIdx * 3 + 1] = point.y * height;
            poseKeypoints2d[opIdx * 3 + 2] = point.visibility; // Confidence
        }
    };

    // Direct Mappings
    setKeypoint(OP.Nose, getPoint(MP.NOSE));
    setKeypoint(OP.RShoulder, getPoint(MP.RIGHT_SHOULDER));
    setKeypoint(OP.RElbow, getPoint(MP.RIGHT_ELBOW));
    setKeypoint(OP.RWrist, getPoint(MP.RIGHT_WRIST));
    setKeypoint(OP.LShoulder, getPoint(MP.LEFT_SHOULDER));
    setKeypoint(OP.LElbow, getPoint(MP.LEFT_ELBOW));
    setKeypoint(OP.LWrist, getPoint(MP.LEFT_WRIST));
    setKeypoint(OP.RHip, getPoint(MP.RIGHT_HIP));
    setKeypoint(OP.RKnee, getPoint(MP.RIGHT_KNEE));
    setKeypoint(OP.RAnkle, getPoint(MP.RIGHT_ANKLE));
    setKeypoint(OP.LHip, getPoint(MP.LEFT_HIP));
    setKeypoint(OP.LKnee, getPoint(MP.LEFT_KNEE));
    setKeypoint(OP.LAnkle, getPoint(MP.LEFT_ANKLE));
    setKeypoint(OP.REye, getPoint(MP.RIGHT_EYE));
    setKeypoint(OP.LEye, getPoint(MP.LEFT_EYE));
    setKeypoint(OP.REar, getPoint(MP.RIGHT_EAR));
    setKeypoint(OP.LEar, getPoint(MP.LEFT_EAR));

    // Calculate Neck (Midpoint of shoulders)
    const rShoulder = getPoint(MP.RIGHT_SHOULDER);
    const lShoulder = getPoint(MP.LEFT_SHOULDER);
    if (rShoulder.visibility > 0.3 && lShoulder.visibility > 0.3) {
        poseKeypoints2d[OP.Neck * 3] = ((rShoulder.x + lShoulder.x) / 2) * width;
        poseKeypoints2d[OP.Neck * 3 + 1] = ((rShoulder.y + lShoulder.y) / 2) * height;
        poseKeypoints2d[OP.Neck * 3 + 2] = (rShoulder.visibility + lShoulder.visibility) / 2;
    }

    // 2. HAND KEYPOINTS (21 points per hand)
    const handLeftKeypoints2d = new Array(21 * 3).fill(0);
    const handRightKeypoints2d = new Array(21 * 3).fill(0);
    
    const dist = (p1: any, p2: any) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

    allHandLandmarks.forEach((handLandmarks, index) => {
        const handednessInfo = allHandedness[index]?.[0];
        if (!handednessInfo) return;
        
        const wrist = handLandmarks[0]; // Wrist is index 0 in Hand Landmarker
        const mpLeftWrist = getPoint(MP.LEFT_WRIST);
        const mpRightWrist = getPoint(MP.RIGHT_WRIST);

        const distLeft = dist(wrist, mpLeftWrist);
        const distRight = dist(wrist, mpRightWrist);

        let targetArray;
        if (distLeft < distRight && distLeft < 0.2) {
             targetArray = handLeftKeypoints2d;
        } else if (distRight < distLeft && distRight < 0.2) {
             targetArray = handRightKeypoints2d;
        } else {
             targetArray = (handednessInfo.categoryName === 'Left') ? handLeftKeypoints2d : handRightKeypoints2d;
        }

        handLandmarks.forEach((pt, i) => {
            targetArray[i * 3] = pt.x * width;
            targetArray[i * 3 + 1] = pt.y * height;
            targetArray[i * 3 + 2] = 1.0;
        });
    });

    // 3. FACE KEYPOINTS (70 points)
    const faceKeypoints2d = new Array(70 * 3).fill(0);
    
    if (faceLandmarksForPerson && faceLandmarksForPerson.length > 0) {
        MP_FACE_TO_OP_70.forEach((mpIndex, opIndex) => {
            if (opIndex < 70) {
                const pt = faceLandmarksForPerson[mpIndex];
                if (pt) {
                    faceKeypoints2d[opIndex * 3] = pt.x * width;
                    faceKeypoints2d[opIndex * 3 + 1] = pt.y * height;
                    faceKeypoints2d[opIndex * 3 + 2] = 1.0;
                }
            }
        });
    }

    return {
        version: 1.3,
        people: [{
            person_id: [-1],
            pose_keypoints_2d: poseKeypoints2d,
            face_keypoints_2d: faceKeypoints2d,
            hand_left_keypoints_2d: handLeftKeypoints2d,
            hand_right_keypoints_2d: handRightKeypoints2d,
            pose_keypoints_3d: [],
            face_keypoints_3d: [],
            hand_left_keypoints_3d: [],
            hand_right_keypoints_3d: []
        }]
    };
};

export const renderPoseSkeleton = (poseData: any): string => {
    if (!poseData || !poseData.people || poseData.people.length === 0) return '';

    const person = poseData.people[0];
    const poseKeypoints = person.pose_keypoints_2d;
    const leftHand = person.hand_left_keypoints_2d;
    const rightHand = person.hand_right_keypoints_2d;
    const faceKeypoints = person.face_keypoints_2d;

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Black background
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate bounds to center the skeleton
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    const checkBounds = (arr: number[]) => {
        for (let i = 0; i < arr.length; i += 3) {
            const x = arr[i], y = arr[i+1], c = arr[i+2];
            if (c > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    };
    
    checkBounds(poseKeypoints);
    checkBounds(leftHand);
    checkBounds(rightHand);
    checkBounds(faceKeypoints);

    if (minX === Infinity) return canvas.toDataURL(); // Empty

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const padding = 100;
    const scale = Math.min((1024 - padding * 2) / contentW, (1024 - padding * 2) / contentH);
    const offsetX = (1024 - contentW * scale) / 2 - minX * scale;
    const offsetY = (1024 - contentH * scale) / 2 - minY * scale;

    const tx = (x: number) => x * scale + offsetX;
    const ty = (y: number) => y * scale + offsetY;

    ctx.lineWidth = 8;
    ctx.lineCap = 'round';

    // Draw Body
    BODY_CONNECTIONS.forEach((pair, i) => {
        const idx1 = pair[0];
        const idx2 = pair[1];
        const x1 = poseKeypoints[idx1 * 3], y1 = poseKeypoints[idx1 * 3 + 1], c1 = poseKeypoints[idx1 * 3 + 2];
        const x2 = poseKeypoints[idx2 * 3], y2 = poseKeypoints[idx2 * 3 + 1], c2 = poseKeypoints[idx2 * 3 + 2];

        if (c1 > 0.1 && c2 > 0.1) {
            ctx.strokeStyle = COLORS.body[i % COLORS.body.length];
            ctx.beginPath();
            ctx.moveTo(tx(x1), ty(y1));
            ctx.lineTo(tx(x2), ty(y2));
            ctx.stroke();
        }
    });
    
    for(let i=0; i<18; i++) {
        const x = poseKeypoints[i*3], y = poseKeypoints[i*3+1], c = poseKeypoints[i*3+2];
        if (c > 0.1) {
            ctx.fillStyle = COLORS.body[i % COLORS.body.length];
            ctx.beginPath();
            ctx.arc(tx(x), ty(y), 6, 0, 2*Math.PI);
            ctx.fill();
        }
    }

    // Helper for hands
    const drawHand = (keypoints: number[]) => {
        HAND_CONNECTIONS.forEach(pair => {
            const idx1 = pair[0], idx2 = pair[1];
            const x1 = keypoints[idx1*3], y1 = keypoints[idx1*3+1], c1 = keypoints[idx1*3+2];
            const x2 = keypoints[idx2*3], y2 = keypoints[idx2*3+1], c2 = keypoints[idx2*3+2];
             if (c1 > 0.1 && c2 > 0.1) {
                ctx.strokeStyle = COLORS.hand;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(tx(x1), ty(y1));
                ctx.lineTo(tx(x2), ty(y2));
                ctx.stroke();
            }
        });
        for(let i=0; i<21; i++) {
            const x = keypoints[i*3], y = keypoints[i*3+1], c = keypoints[i*3+2];
             if (c > 0.1) {
                ctx.fillStyle = COLORS.hand;
                ctx.beginPath();
                ctx.arc(tx(x), ty(y), 3, 0, 2*Math.PI);
                ctx.fill();
            }
        }
    };

    drawHand(leftHand);
    drawHand(rightHand);

    // Draw Face (Points only)
    // Draw small white dots for face landmarks to verify presence in skeleton view
    for(let i=0; i<70; i++) {
        const x = faceKeypoints[i*3], y = faceKeypoints[i*3+1], c = faceKeypoints[i*3+2];
        if (c > 0.1) {
            ctx.fillStyle = COLORS.face;
            ctx.beginPath();
            ctx.arc(tx(x), ty(y), 3, 0, 2*Math.PI);
            ctx.fill();
        }
    }

    return canvas.toDataURL('image/png');
};
