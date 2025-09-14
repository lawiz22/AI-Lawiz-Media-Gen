
import React, { useState } from 'react';
import JSZip from 'jszip';
import type { GeneratedClothing } from '../types';
import { DownloadIcon, ResetIcon, SpinnerIcon } from './icons';

interface ResultsDisplayProps {
  originalImage: string;
  generatedItems: GeneratedClothing[];
  onReset: () => void;
}

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ originalImage, generatedItems, onReset }) => {
    const [isZipping, setIsZipping] = useState(false);

    const handleDownloadAll = async () => {
        setIsZipping(true);
        try {
            const zip = new JSZip();
            const folder = zip.folder('extracted-clothing');
            if (!folder) throw new Error("Could not create zip folder.");

            generatedItems.forEach((item, index) => {
                const safeName = item.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const laidOutBase64 = item.laidOutImage.split(',')[1];
                const foldedBase64 = item.foldedImage.split(',')[1];

                if (laidOutBase64) {
                    folder.file(`${index + 1}_${safeName}_laid_out.png`, laidOutBase64, { base64: true });
                }
                if (foldedBase64) {
                    folder.file(`${index + 1}_${safeName}_folded.png`, foldedBase64, { base64: true });
                }
            });

            const content = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = 'extracted-clothing.zip';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

        } catch (err) {
            console.error("Failed to create zip file:", err);
            alert("Sorry, there was an error creating the zip file.");
        } finally {
            setIsZipping(false);
        }
    };

  return (
    <div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
            <h2 className="text-2xl font-bold text-accent">Extraction Results</h2>
            <div className="flex gap-4">
                <button
                    onClick={onReset}
                    className="flex items-center gap-2 bg-bg-tertiary text-text-secondary font-semibold py-2 px-4 rounded-lg hover:bg-bg-tertiary-hover transition-colors"
                >
                    <ResetIcon className="w-5 h-5" /> Start Over
                </button>
                <button
                    onClick={handleDownloadAll}
                    disabled={isZipping}
                    className="flex items-center gap-2 bg-accent text-accent-text font-bold py-2 px-4 rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                    {isZipping ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <DownloadIcon className="w-5 h-5" />}
                    {isZipping ? 'Zipping...' : 'Download All'}
                </button>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
                <h3 className="text-lg font-semibold text-text-primary mb-2">Original Image</h3>
                <img src={originalImage} alt="Original input" className="rounded-lg shadow-md w-full" />
            </div>

            <div className="lg:col-span-2">
                <h3 className="text-lg font-semibold text-text-primary mb-2">Extracted Items ({generatedItems.length})</h3>
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-4 -mr-4 border border-border-primary rounded-lg p-4 bg-bg-primary/50">
                    {generatedItems.map((item, index) => (
                        <div key={index} className="bg-bg-tertiary p-4 rounded-lg shadow-sm">
                            <h4 className="font-bold text-accent mb-3">{item.name}</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm font-medium text-text-secondary mb-2 text-center">Laid Out</p>
                                    <img src={item.laidOutImage} alt={`${item.name} laid out`} className="w-full aspect-square object-cover rounded-md bg-bg-secondary" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-text-secondary mb-2 text-center">Folded</p>
                                    <img src={item.foldedImage} alt={`${item.name} folded`} className="w-full aspect-square object-cover rounded-md bg-bg-secondary" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
  );
};
