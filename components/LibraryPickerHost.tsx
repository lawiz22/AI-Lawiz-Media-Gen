import React from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import type { AppDispatch, RootState } from '../store/store';
import type { LibraryItem, LibraryPicker, UploadedFile } from '../types';
import { setModalOpen } from '../store/appSlice';
import {
    setBackgroundImage, setCharacterPoseImage, setClothingImage, setElementImages, setMaskImage, setSourceImage, updateCharacterOptions, updateOptions,
} from '../store/generationSlice';
import { updatePromptGenState } from '../store/promptGenSlice';
import { updateExtractorState } from '../store/extractorSlice';
import { updateVideoUtilsState } from '../store/videoSlice';
import { updateLogoThemeState } from '../store/logoThemeSlice';
import { setUploadedFiles } from '../store/groupPhotoFusionSlice';
import { LibraryPickerModal } from './LibraryPickerModal';

const ANY_IMAGE: LibraryItem['mediaType'][] = ['image', 'character', 'extracted-frame', 'logo', 'banner', 'album-cover', 'clothes', 'object', 'pose', 'group-fusion', 'swap-anything', 'past-forward-photo'];
const usesPoseLibrary = (options: RootState['generation']['characterOptions']) =>
    options.provider === 'comfyui' && options.comfyCharacterMode !== 'flux2' && options.comfyCharacterMode !== 'qwen21-create';
const getLibraryReferencePrompt = (item: LibraryItem): string => {
    if (['clothes', 'pose', 'object'].includes(item.mediaType) && item.name?.trim()) return item.name.trim();
    const candidates = [
        item.options?.comfyFlux2Prompt,
        item.options?.comfyPrompt,
        item.options?.geminiPrompt,
        item.themeOptions?.prompt,
        item.name,
    ];
    return candidates.find(candidate => candidate?.trim() && !/^(image|character)\s*#?\d+/i.test(candidate.trim()))?.trim() || '';
};
const libraryFile = async (item: LibraryItem, name: string): Promise<File> => {
    const blob = await (await fetch(item.media)).blob();
    return new File([blob], name, { type: blob.type });
};

/**
 * Every "choose from Library" dialog of the workflows. It subscribes to the open picker itself and reads the rest
 * of the store when an item is chosen, so opening a picker does not re-render the application.
 */
export const LibraryPickerHost: React.FC = () => {
    const dispatch: AppDispatch = useDispatch();
    const store = useStore<RootState>();
    const active = useSelector((state: RootState) => state.app.activePicker);
    const poseMultiSelect = useSelector((state: RootState) => usesPoseLibrary(state.generation.characterOptions));
    const refineAnyImage = useSelector((state: RootState) => state.generation.options.comfyModelType === 'flux2-edit' || state.generation.options.comfyModelType === 'moss-image');
    const picker = (name: LibraryPicker) => ({ isOpen: active === name, onClose: () => { dispatch(setModalOpen({ modal: name, isOpen: false })); } });
    const logoTheme = () => store.getState().logoTheme.logoThemeState;
    const videoUtils = () => store.getState().video.videoUtilsState;

    return <>
        <LibraryPickerModal {...picker('isClothingPickerOpen')} filter="clothes" onSelectItem={async item => { dispatch(setClothingImage(await libraryFile(item, 'clothing_ref.jpg'))); }} />
        <LibraryPickerModal {...picker('isBackgroundPickerOpen')} filter={['image', 'extracted-frame', 'background' as any]} onSelectItem={async item => { dispatch(setBackgroundImage(await libraryFile(item, 'background_ref.jpg'))); }} />
        <LibraryPickerModal {...picker('isPosePickerOpen')} filter="pose" multiSelect={poseMultiSelect}
            onSelectItem={async item => {
                const characterOptions = store.getState().generation.characterOptions;
                if (!usesPoseLibrary(characterOptions)) { dispatch(setCharacterPoseImage(await libraryFile(item, 'pose_ref.jpg'))); return; }
                dispatch(updateCharacterOptions({ poseLibraryItems: [...(characterOptions.poseLibraryItems || []), item], poseMode: 'library' }));
            }}
            onSelectMultiple={items => {
                if (usesPoseLibrary(store.getState().generation.characterOptions)) dispatch(updateCharacterOptions({ poseLibraryItems: items, poseMode: 'library' }));
            }} />
        <LibraryPickerModal {...picker('isCharacterSourcePickerOpen')} filter={ANY_IMAGE} onSelectItem={async item => { dispatch(setSourceImage(await libraryFile(item, 'char_source.jpg'))); }} />
        <LibraryPickerModal {...picker('isRefineSourcePickerOpen')} filter={refineAnyImage ? ANY_IMAGE : 'image'} onSelectItem={async item => {
            const response = await fetch(item.media);
            if (!response.ok) throw new Error('Could not load the Library source image.');
            const blob = await response.blob();
            if (!blob.type.startsWith('image/')) throw new Error('Choose a Library image to use as the source.');
            dispatch(setSourceImage(new File([blob], 'refine_source.png', { type: blob.type })));
        }} />
        <LibraryPickerModal {...picker('isMaskPickerOpen')} filter="image" onSelectItem={async item => { dispatch(setMaskImage(await libraryFile(item, 'mask.png'))); }} />
        <LibraryPickerModal {...picker('isElementPickerOpen')} filter={ANY_IMAGE} onSelectItem={async item => {
            const { options, elementImages } = store.getState().generation;
            const file = await libraryFile(item, `element_${Date.now()}.jpg`);
            dispatch(setElementImages([...elementImages, file].slice(0, options.comfyModelType === 'flux2-edit' ? 3 : 2)));
            if (options.comfyModelType !== 'flux2-edit' || elementImages.length >= 3) return;
            const roles = [...(options.comfyFlux2EditReferenceRoles || ['outfit', 'background', 'pose'])];
            const libraryPrompts = [...(options.comfyFlux2EditReferenceLibraryPrompts || [])];
            roles[elementImages.length] = item.mediaType === 'clothes' ? 'outfit' : item.mediaType === 'pose' ? 'pose' : roles[elementImages.length] || 'custom';
            libraryPrompts[elementImages.length] = getLibraryReferencePrompt(item);
            dispatch(updateOptions({ comfyFlux2EditReferenceRoles: roles, comfyFlux2EditReferenceLibraryPrompts: libraryPrompts }));
        }} />

        <LibraryPickerModal {...picker('isPromptGenImagePickerOpen')} filter="image" onSelectItem={async item => { dispatch(updatePromptGenState({ image: await libraryFile(item, 'source.jpg') })); }} />
        <LibraryPickerModal {...picker('isPromptGenBgImagePickerOpen')} filter="image" onSelectItem={async item => { dispatch(updatePromptGenState({ bgImage: await libraryFile(item, 'bg_source.jpg') })); }} />
        <LibraryPickerModal {...picker('isPromptGenSubjectImagePickerOpen')} filter="image" onSelectItem={async item => { dispatch(updatePromptGenState({ subjectImage: await libraryFile(item, 'subj_source.jpg') })); }} />

        <LibraryPickerModal {...picker('isClothesSourcePickerOpen')} filter="image" onSelectItem={async item => { dispatch(updateExtractorState({ clothesSourceFile: await libraryFile(item, 'source.jpg') })); }} />
        <LibraryPickerModal {...picker('isHairSourcePickerOpen')} filter={['image', 'character', 'group-fusion']} onSelectItem={async item => { dispatch(updateExtractorState({ hairSourceFile: await libraryFile(item, 'source.jpg'), generatedHair: [] })); }} />
        <LibraryPickerModal {...picker('isObjectSourcePickerOpen')} filter="image" onSelectItem={async item => { dispatch(updateExtractorState({ objectSourceFile: await libraryFile(item, 'source.jpg') })); }} />
        <LibraryPickerModal {...picker('isPoseSourcePickerOpen')} filter="image" onSelectItem={async item => { dispatch(updateExtractorState({ poseSourceFile: await libraryFile(item, 'source.jpg') })); }} />
        <LibraryPickerModal {...picker('isMannequinRefPickerOpen')} filter="image" onSelectItem={async item => { dispatch(updateExtractorState({ mannequinReferenceFile: await libraryFile(item, 'ref.jpg') })); }} />
        <LibraryPickerModal {...picker('isFontSourcePickerOpen')} filter="image" onSelectItem={async item => { dispatch(updateExtractorState({ fontSourceFile: await libraryFile(item, 'source.jpg') })); }} />

        <LibraryPickerModal {...picker('isColorImagePickerOpen')} filter="image" onSelectItem={async item => {
            const colorPicker = videoUtils().colorPicker;
            dispatch(updateVideoUtilsState({ colorPicker: { ...colorPicker, imageFile: await libraryFile(item, 'source.jpg') } }));
        }} />
        <LibraryPickerModal {...picker('isVideoUtilsPickerOpen')} filter="video" onSelectItem={async item => { dispatch(updateVideoUtilsState({ videoFile: await libraryFile(item, 'video.mp4') })); }} />
        <LibraryPickerModal {...picker('isResizeCropPickerOpen')} filter="image" onSelectItem={async item => {
            const resizeCrop = videoUtils().resizeCrop;
            dispatch(updateVideoUtilsState({ resizeCrop: { ...resizeCrop, sourceFile: await libraryFile(item, 'source.jpg') } }));
        }} />
        <LibraryPickerModal {...picker('isGroupFusionPickerOpen')} filter="image" onSelectItem={async item => {
            const uploadedFiles = store.getState().groupPhotoFusion.uploadedFiles;
            const file = await libraryFile(item, `group-fusion-${item.id}.jpg`);
            const added: UploadedFile = { id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), personaId: 'default' };
            dispatch(setUploadedFiles([...uploadedFiles, added]));
        }} />

        <LibraryPickerModal {...picker('isLogoRefPickerOpen')} filter="image" onSelectItem={item => dispatch(updateLogoThemeState({ referenceItems: [...(logoTheme().referenceItems || []), item] }))} />
        <LibraryPickerModal {...picker('isLogoPalettePickerOpen')} filter="color-palette" onSelectItem={item => dispatch(updateLogoThemeState({ selectedPalette: item }))} />
        <LibraryPickerModal {...picker('isLogoFontPickerOpen')} filter="font" onSelectItem={item => dispatch(updateLogoThemeState({ selectedFont: item, fontReferenceImage: null }))} />
        <LibraryPickerModal {...picker('isBannerRefPickerOpen')} filter="image" onSelectItem={item => dispatch(updateLogoThemeState({ bannerReferenceItems: [...(logoTheme().bannerReferenceItems || []), item] }))} />
        <LibraryPickerModal {...picker('isBannerPalettePickerOpen')} filter="color-palette" onSelectItem={item => dispatch(updateLogoThemeState({ bannerSelectedPalette: item }))} />
        <LibraryPickerModal {...picker('isBannerLogoPickerOpen')} filter="logo" onSelectItem={item => dispatch(updateLogoThemeState({ bannerSelectedLogo: item }))} />
        <LibraryPickerModal {...picker('isBannerFontPickerOpen')} filter="font" onSelectItem={item => dispatch(updateLogoThemeState({ bannerSelectedFont: item, bannerFontReferenceImage: null }))} />
        <LibraryPickerModal {...picker('isAlbumCoverRefPickerOpen')} filter="image" onSelectItem={item => dispatch(updateLogoThemeState({ albumReferenceItems: [...(logoTheme().albumReferenceItems || []), item] }))} />
        <LibraryPickerModal {...picker('isAlbumCoverPalettePickerOpen')} filter="color-palette" onSelectItem={item => dispatch(updateLogoThemeState({ albumSelectedPalette: item }))} />
        <LibraryPickerModal {...picker('isAlbumCoverLogoPickerOpen')} filter="logo" onSelectItem={item => dispatch(updateLogoThemeState({ albumSelectedLogo: item }))} />
        <LibraryPickerModal {...picker('isAlbumCoverFontPickerOpen')} filter="font" onSelectItem={item => dispatch(updateLogoThemeState({ albumSelectedFont: item, albumFontReferenceImage: null }))} />
    </>;
};
