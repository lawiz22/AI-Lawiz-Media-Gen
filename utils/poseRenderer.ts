// MediaPipe landmark indices
const MP_LANDMARKS = {
    NOSE: 0,
    LEFT_EYE: 2,
    RIGHT_EYE: 5,
    LEFT_EAR: 7,
    RIGHT_EAR: 8,
    LEFT_SHOULDER: 11,
    RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13,
    RIGHT_ELBOW: 14,
    LEFT_WRIST: 15,
    RIGHT_WRIST: 16,
    LEFT_HIP: 23,
    RIGHT_HIP: 24,
    LEFT_KNEE: 25,
    RIGHT_KNEE: 26,
    LEFT_ANKLE: 27,
    RIGHT_ANKLE: 28,
};

// OpenPose (COCO) keypoint indices
const OP_KEYPOINTS = {
    Nose: 0, Neck: 1, RShoulder: 2, RElbow: 3, RWrist: 4, LShoulder: 5, LElbow: 6, LWrist: 7,
    RHip: 8, RKnee: 9, RAnkle: 10, LHip: 11, LKnee: 12, LAnkle: 13, REye: 14, LEye: 15,
    REar: 16, LEar: 17
};

export const mediaPipeToOpenPose = (
    bodyLandmarksForPerson: any[],
    allHandLandmarks: any[][],
    allHandedness: any[][],
    faceLandmarksForPerson: any[] | undefined,
    width: number,
    height: number
) => {
    const poseKeypoints2d = new Array(18 * 3).fill(0);

    const setKeypoint = (opIndex: number, mpIndex: number) => {
        if (bodyLandmarksForPerson[mpIndex]) {
            const landmark = bodyLandmarksForPerson[mpIndex];
            if (landmark.visibility > 0.2) { // Confidence threshold
                poseKeypoints2d[opIndex * 3] = landmark.x * width;
                poseKeypoints2d[opIndex * 3 + 1] = landmark.y * height;
                poseKeypoints2d[opIndex * 3 + 2] = landmark.visibility;
            }
        }
    };

    setKeypoint(OP_KEYPOINTS.Nose, MP_LANDMARKS.NOSE);
    setKeypoint(OP_KEYPOINTS.RShoulder, MP_LANDMARKS.RIGHT_SHOULDER);
    setKeypoint(OP_KEYPOINTS.RElbow, MP_LANDMARKS.RIGHT_ELBOW);
    setKeypoint(OP_KEYPOINTS.RWrist, MP_LANDMARKS.RIGHT_WRIST);
    setKeypoint(OP_KEYPOINTS.LShoulder, MP_LANDMARKS.LEFT_SHOULDER);
    setKeypoint(OP_KEYPOINTS.LElbow, MP_LANDMARKS.LEFT_ELBOW);
    setKeypoint(OP_KEYPOINTS.LWrist, MP_LANDMARKS.LEFT_WRIST);
    setKeypoint(OP_KEYPOINTS.RHip, MP_LANDMARKS.RIGHT_HIP);
    setKeypoint(OP_KEYPOINTS.RKnee, MP_LANDMARKS.RIGHT_KNEE);
    setKeypoint(OP_KEYPOINTS.RAnkle, MP_LANDMARKS.RIGHT_ANKLE);
    setKeypoint(OP_KEYPOINTS.LHip, MP_LANDMARKS.LEFT_HIP);
    setKeypoint(OP_KEYPOINTS.LKnee, MP_LANDMARKS.LEFT_KNEE);
    setKeypoint(OP_KEYPOINTS.LAnkle, MP_LANDMARKS.LEFT_ANKLE);
    setKeypoint(OP_KEYPOINTS.REye, MP_LANDMARKS.RIGHT_EYE);
    setKeypoint(OP_KEYPOINTS.LEye, MP_LANDMARKS.LEFT_EYE);
    setKeypoint(OP_KEYPOINTS.REar, MP_LANDMARKS.RIGHT_EAR);
    setKeypoint(OP_KEYPOINTS.LEar, MP_LANDMARKS.LEFT_EAR);

    // Calculate Neck keypoint as the midpoint of the shoulders
    const lShoulder = bodyLandmarksForPerson[MP_LANDMARKS.LEFT_SHOULDER];
    const rShoulder = bodyLandmarksForPerson[MP_LANDMARKS.RIGHT_SHOULDER];
    if (lShoulder && rShoulder && lShoulder.visibility > 0.2 && rShoulder.visibility > 0.2) {
        poseKeypoints2d[OP_KEYPOINTS.Neck * 3] = ((lShoulder.x + rShoulder.x) / 2) * width;
        poseKeypoints2d[OP_KEYPOINTS.Neck * 3 + 1] = ((lShoulder.y + rShoulder.y) / 2) * height;
        poseKeypoints2d[OP_KEYPOINTS.Neck * 3 + 2] = Math.min(lShoulder.visibility, rShoulder.visibility);
    }
    
    // --- Hand Processing ---
    const handLeftKeypoints2d = new Array(21 * 3).fill(0);
    const handRightKeypoints2d = new Array(21 * 3).fill(0);
    
    // Find hands associated with this person
    const personCenter = {
        x: (lShoulder.x + rShoulder.x + bodyLandmarksForPerson[MP_LANDMARKS.LEFT_HIP].x + bodyLandmarksForPerson[MP_LANDMARKS.RIGHT_HIP].x) / 4,
        y: (lShoulder.y + rShoulder.y + bodyLandmarksForPerson[MP_LANDMARKS.LEFT_HIP].y + bodyLandmarksForPerson[MP_LANDMARKS.RIGHT_HIP].y) / 4
    };
    
    allHandLandmarks.forEach((hand, index) => {
        const handType = allHandedness[index]?.[0]?.categoryName;
        if (!handType) return;
        
        const handWrist = hand[0];
        const distToPerson = Math.hypot(handWrist.x - personCenter.x, handWrist.y - personCenter.y);
        
        // Simple association: if a hand is reasonably close to the body, assign it.
        // This is a simplification; more complex logic would be needed for overlapping people.
        if (distToPerson < 0.5) {
            const targetArray = handType === 'Left' ? handLeftKeypoints2d : handRightKeypoints2d;
            hand.forEach((landmark, lmIndex) => {
                targetArray[lmIndex * 3] = landmark.x * width;
                targetArray[lmIndex * 3 + 1] = landmark.y * height;
                targetArray[lmIndex * 3 + 2] = landmark.visibility || 1.0;
            });
        }
    });

    // --- Face Processing ---
    const faceKeypoints2d = new Array(478 * 3).fill(0);
    if (faceLandmarksForPerson) {
        faceLandmarksForPerson.forEach((landmark, lmIndex) => {
            if (lmIndex < 478) { // MediaPipe provides 478 landmarks
                faceKeypoints2d[lmIndex * 3] = landmark.x * width;
                faceKeypoints2d[lmIndex * 3 + 1] = landmark.y * height;
                faceKeypoints2d[lmIndex * 3 + 2] = landmark.visibility || 1.0;
            }
        });
    }

    return {
        width,
        height,
        people: [{ 
            pose_keypoints_2d: poseKeypoints2d,
            hand_left_keypoints_2d: handLeftKeypoints2d,
            hand_right_keypoints_2d: handRightKeypoints2d,
            face_keypoints_2d: faceKeypoints2d,
        }]
    };
};

// Define keypoint indices based on COCO format
const KeypointIndices = {
    Nose: 0, Neck: 1, RShoulder: 2, RElbow: 3, RWrist: 4, LShoulder: 5, LElbow: 6, LWrist: 7,
    RHip: 8, RKnee: 9, RAnkle: 10, LHip: 11, LKnee: 12, LAnkle: 13, REye: 14, LEye: 15,
    REar: 16, LEar: 17
};

// Define connections between keypoints and their colors, approximating the user's example
const POSE_CONNECTIONS = [
    // Torso
    { from: KeypointIndices.LShoulder, to: KeypointIndices.RShoulder, color: '#FF0000' }, // Red
    { from: KeypointIndices.LHip, to: KeypointIndices.RHip, color: '#0000FF' }, // Blue
    { from: KeypointIndices.LShoulder, to: KeypointIndices.LHip, color: '#00FF00' }, // Green
    { from: KeypointIndices.RShoulder, to: KeypointIndices.RHip, color: '#FFA500' }, // Orange

    // Right Arm
    { from: KeypointIndices.RShoulder, to: KeypointIndices.RElbow, color: '#FFA500' }, // Orange
    { from: KeypointIndices.RElbow, to: KeypointIndices.RWrist, color: '#FFD700' }, // Gold

    // Left Arm
    { from: KeypointIndices.LShoulder, to: KeypointIndices.LElbow, color: '#00FF00' }, // Green
    { from: KeypointIndices.LElbow, to: KeypointIndices.LWrist, color: '#ADFF2F' }, // Green-Yellow
    
    // Right Leg
    { from: KeypointIndices.RHip, to: KeypointIndices.RKnee, color: '#0000FF' }, // Blue
    { from: KeypointIndices.RKnee, to: KeypointIndices.RAnkle, color: '#00BFFF' }, // DeepSkyBlue

    // Left Leg
    { from: KeypointIndices.LHip, to: KeypointIndices.LKnee, color: '#00FF00' }, // Green
    { from: KeypointIndices.LKnee, to: KeypointIndices.LAnkle, color: '#ADFF2F' }, // Green-Yellow
];

const FACE_CONNECTIONS = [
    {from: KeypointIndices.LEye, to: KeypointIndices.REye, color: '#FF00FF'},
    {from: KeypointIndices.LEye, to: KeypointIndices.Nose, color: '#FF00FF'},
    {from: KeypointIndices.REye, to: KeypointIndices.Nose, color: '#FF00FF'},
    {from: KeypointIndices.LEar, to: KeypointIndices.LEye, color: '#FF00FF'},
    {from: KeypointIndices.REar, to: KeypointIndices.REye, color: '#FF00FF'},
];

const HAND_CONNECTIONS: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8], // Index
    [5, 9], [9, 10], [10, 11], [11, 12], // Middle
    [9, 13], [13, 14], [14, 15], [15, 16], // Ring
    [13, 17], [0, 17], [17, 18], [18, 19], [19, 20] // Pinky, Palm
];


export const renderPoseSkeleton = (poseData: any, renderBody: boolean = true, renderFace: boolean = true): string => {
    if (!poseData || !poseData.people || poseData.people.length === 0) {
        return '';
    }

    const CANVAS_SIZE = 1024;
    const PADDING = 100;

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const allPoints = [];
    for (const person of poseData.people) {
        for (let i = 0; i < person.pose_keypoints_2d.length; i += 3) {
            if (person.pose_keypoints_2d[i+2] > 0.1) {
                allPoints.push({ x: person.pose_keypoints_2d[i], y: person.pose_keypoints_2d[i+1] });
            }
        }
    }
    if (allPoints.length === 0) return canvas.toDataURL('image/png');

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allPoints.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    });

    const skeletonWidth = maxX - minX;
    const skeletonHeight = maxY - minY;
    
    const scale = Math.min(
        (CANVAS_SIZE - PADDING * 2) / skeletonWidth,
        (CANVAS_SIZE - PADDING * 2) / skeletonHeight
    );
    
    const offsetX = (CANVAS_SIZE - skeletonWidth * scale) / 2 - minX * scale;
    const offsetY = (CANVAS_SIZE - skeletonHeight * scale) / 2 - minY * scale;

    const transformPoint = (p: {x: number, y: number}) => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY });

    ctx.lineWidth = Math.max(2, CANVAS_SIZE / 256);

    for (const person of poseData.people) {
        const keypoints = person.pose_keypoints_2d;
        if (keypoints && keypoints.length >= 54) {
            const points = [];
            for (let i = 0; i < keypoints.length; i += 3) {
                points.push({ x: keypoints[i], y: keypoints[i + 1], confidence: keypoints[i + 2] });
            }
            
            const connectionsToRender = [];
            if (renderBody) connectionsToRender.push(...POSE_CONNECTIONS);
            if (renderFace) connectionsToRender.push(...FACE_CONNECTIONS);

            // Draw connections
            connectionsToRender.forEach(conn => {
                const p1 = points[conn.from];
                const p2 = points[conn.to];
                if (p1 && p2 && p1.confidence > 0.1 && p2.confidence > 0.1) {
                    const tp1 = transformPoint(p1);
                    const tp2 = transformPoint(p2);
                    ctx.beginPath();
                    ctx.moveTo(tp1.x, tp1.y);
                    ctx.lineTo(tp2.x, tp2.y);
                    ctx.strokeStyle = conn.color;
                    ctx.stroke();
                }
            });
            
            // Draw keypoints
            points.forEach((p) => {
                if (p.confidence > 0.1) {
                    const tp = transformPoint(p);
                    ctx.beginPath();
                    ctx.arc(tp.x, tp.y, ctx.lineWidth * 2, 0, 2 * Math.PI);
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fill();
                }
            });
        }

        const drawHand = (handKeypoints: number[] | undefined, color: string) => {
            if (!handKeypoints || handKeypoints.length < 63) return;
            const handPoints = [];
            for (let i = 0; i < handKeypoints.length; i += 3) {
                handPoints.push({ x: handKeypoints[i], y: handKeypoints[i + 1], confidence: handKeypoints[i + 2] });
            }
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(1, CANVAS_SIZE / 512);
            HAND_CONNECTIONS.forEach(conn => {
                const p1 = handPoints[conn[0]];
                const p2 = handPoints[conn[1]];
                if (p1 && p2 && p1.confidence > 0.1 && p2.confidence > 0.1) {
                    const tp1 = transformPoint(p1);
                    const tp2 = transformPoint(p2);
                    ctx.beginPath();
                    ctx.moveTo(tp1.x, tp1.y);
                    ctx.lineTo(tp2.x, tp2.y);
                    ctx.stroke();
                }
            });
            handPoints.forEach(p => {
                if (p.confidence > 0.1) {
                    const tp = transformPoint(p);
                    ctx.beginPath();
                    ctx.arc(tp.x, tp.y, ctx.lineWidth * 1.5, 0, 2 * Math.PI);
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fill();
                }
            });
        };

        drawHand(person.hand_left_keypoints_2d, '#ADFF2F');
        drawHand(person.hand_right_keypoints_2d, '#FFD700');
    }

    return canvas.toDataURL('image/png');
};
