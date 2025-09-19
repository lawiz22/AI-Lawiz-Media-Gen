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


export const renderPoseSkeleton = (poseData: any, renderBody: boolean = true, renderFace: boolean = true): string => {
    if (!poseData || !poseData.people || poseData.people.length === 0) {
        return '';
    }

    const canvas = document.createElement('canvas');
    canvas.width = poseData.width;
    canvas.height = poseData.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        return '';
    }
    
    // Black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = Math.max(2, Math.min(canvas.width, canvas.height) / 200);

    for (const person of poseData.people) {
        const keypoints = person.pose_keypoints_2d;
        if (!keypoints || keypoints.length < 54) continue;

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
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = conn.color;
                ctx.stroke();
            }
        });
        
        // Draw keypoints
        points.forEach((p, index) => {
            if (p.confidence > 0.1) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, ctx.lineWidth * 2, 0, 2 * Math.PI);
                ctx.fillStyle = '#FFFFFF'; // White dots for keypoints
                ctx.fill();
            }
        });
    }

    return canvas.toDataURL('image/png');
};