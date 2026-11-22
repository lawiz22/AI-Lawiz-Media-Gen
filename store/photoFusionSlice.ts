import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { FUSION_SCENES, type FusionDetail, type FusionEngine, type FusionResult, type FusionSubject } from '../photoFusion/scenes';

interface PhotoFusionState {
    engine: FusionEngine;
    subjects: FusionSubject[];
    backdrop: FusionSubject | null;
    sceneId: string;
    detail: FusionDetail;
    count: number;
    busy: boolean;
    results: FusionResult[] | null;
    error: string | null;
}

const initialState: PhotoFusionState = {
    engine: 'comfyui', subjects: [], backdrop: null, sceneId: FUSION_SCENES[0].id, detail: 'high', count: 1, busy: false, results: null, error: null,
};

const photoFusionSlice = createSlice({
    name: 'photoFusion',
    initialState,
    reducers: {
        setEngine: (state, action: PayloadAction<FusionEngine>) => { state.engine = action.payload; state.results = null; state.error = null; },
        addSubjects: (state, action: PayloadAction<FusionSubject[]>) => { state.subjects.push(...action.payload); state.error = null; },
        removeSubject: (state, action: PayloadAction<string>) => { state.subjects = state.subjects.filter(subject => subject.id !== action.payload); },
        patchSubject: (state, action: PayloadAction<Pick<FusionSubject, 'id'> & Partial<Pick<FusionSubject, 'expression' | 'knownAs'>>>) => {
            const subject = state.subjects.find(item => item.id === action.payload.id);
            if (subject) Object.assign(subject, action.payload);
        },
        setBackdrop: (state, action: PayloadAction<FusionSubject | null>) => { state.backdrop = action.payload; },
        resetPhotoFusion: state => ({ ...initialState, engine: state.engine }),
        setScene: (state, action: PayloadAction<string>) => { state.sceneId = action.payload; },
        setDetail: (state, action: PayloadAction<FusionDetail>) => { state.detail = action.payload; },
        setCount: (state, action: PayloadAction<number>) => { state.count = action.payload; },
        setBusy: (state, action: PayloadAction<boolean>) => { state.busy = action.payload; },
        setResults: (state, action: PayloadAction<FusionResult[] | null>) => { state.results = action.payload; },
        patchResult: (state, action: PayloadAction<Pick<FusionResult, 'id'> & Partial<FusionResult>>) => {
            const result = state.results?.find(item => item.id === action.payload.id);
            if (result) Object.assign(result, action.payload);
        },
        setFusionError: (state, action: PayloadAction<string | null>) => { state.error = action.payload; },
    },
});

export const {
    setEngine, addSubjects, removeSubject, patchSubject, setBackdrop, resetPhotoFusion, setScene, setDetail, setCount,
    setBusy, setResults, patchResult, setFusionError,
} = photoFusionSlice.actions;

export default photoFusionSlice.reducer;
