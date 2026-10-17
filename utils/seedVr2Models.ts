interface SeedVr2ModelNode {
    input?: {
        required?: { model?: unknown };
        optional?: { model?: unknown };
    };
}

interface SeedVr2ObjectInfo {
    SeedVR2LoadDiTModel?: SeedVr2ModelNode;
    SeedVR2LoadVAEModel?: SeedVr2ModelNode;
}

const getModelChoices = (node: SeedVr2ModelNode | undefined): string[] => {
    const widget = node?.input?.required?.model ?? node?.input?.optional?.model;
    if (!Array.isArray(widget)) return [];
    const choices: unknown = Array.isArray(widget[0]) ? widget[0] : widget[1]?.options;
    return Array.isArray(choices)
        ? Array.from(new Set(choices.filter((choice): choice is string => typeof choice === 'string' && choice.trim().length > 0)))
        : [];
};

export const getSeedVr2Models = (objectInfo: SeedVr2ObjectInfo | null | undefined) => ({
    ditModels: getModelChoices(objectInfo?.SeedVR2LoadDiTModel),
    vaeModels: getModelChoices(objectInfo?.SeedVR2LoadVAEModel),
});

export const selectSeedVr2Model = (models: string[], selected: string): string =>
    models.includes(selected) ? selected : models[0] ?? '';
