import type { PromptSoupIngredient } from '../types';

const SOURCE_CLASSES = [
  'text-accent',
  'text-highlight-green',
  'text-highlight-yellow',
  'text-pink-400',
  'text-blue-400',
  'text-orange-400',
  'text-rose-400',
  'text-lime-400',
  'text-violet-400',
  'text-sky-400',
  'text-emerald-400',
  'text-amber-400',
];

const SOURCE_HEX_COLORS = [
  '#22d3ee',
  '#4ade80',
  '#facc15',
  '#f472b6',
  '#60a5fa',
  '#fb923c',
  '#fb7185',
  '#a3e635',
  '#a78bfa',
  '#38bdf8',
  '#34d399',
  '#fbbf24',
];

export const getPromptSoupSourceClass = (source: number): string =>
  source > 0 ? SOURCE_CLASSES[(source - 1) % SOURCE_CLASSES.length] : 'text-text-primary';

export const getPromptSoupSourceHex = (source: number, fallback = '#e5e7eb'): string =>
  source > 0 ? SOURCE_HEX_COLORS[(source - 1) % SOURCE_HEX_COLORS.length] : fallback;

export const buildPromptSoupIngredients = (
  mainPrompt: string,
  additionalMainPrompts: string[],
  backgroundPrompt: string,
  additionalBackgroundPrompts: string[],
  subjectPrompt: string,
  additionalSubjectPrompts: string[],
): PromptSoupIngredient[] => {
  const groups = [
    { label: 'Main', sourceOffset: 1, prompts: [mainPrompt, ...additionalMainPrompts] },
    { label: 'Background', sourceOffset: 2, prompts: [backgroundPrompt, ...additionalBackgroundPrompts] },
    { label: 'Subject', sourceOffset: 3, prompts: [subjectPrompt, ...additionalSubjectPrompts] },
  ];

  return groups.flatMap(({ label, sourceOffset, prompts }) => prompts.flatMap((text, index) => {
    const trimmedText = text.trim();
    if (!trimmedText) return [];
    return [{
      text: trimmedText,
      label: index === 0 ? label : `${label} ${index + 1}`,
      source: sourceOffset + index * 3,
    }];
  }));
};