import React, { useState } from 'react';

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export const ArchiveCivitPanel: React.FC = () => {
    const [query, setQuery] = useState('');

    const search = () => {
        const value = query.trim();
        if (!value) return;
        const url = SHA256_PATTERN.test(value)
            ? `https://civitaiarchive.com/sha256/${encodeURIComponent(value)}`
            : `https://civitaiarchive.com/search?q=${encodeURIComponent(value)}&rating=all`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
        <section className="space-y-5">
            <div className="border-l-4 border-emerald-500 pl-4">
                <h2 className="text-xl font-bold text-text-primary">ArchiveCivit</h2>
                <p className="text-sm text-text-secondary mt-1">Search archived models and mirrors by filename, model name, SHA-256, or Civitai link.</p>
            </div>
            <form onSubmit={event => { event.preventDefault(); search(); }} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Filename, model name, SHA-256, or Civitai URL" className="bg-bg-tertiary border border-border-primary rounded-md px-3 py-2.5 text-text-primary" />
                <button type="submit" disabled={!query.trim()} className="px-5 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50">Search ArchiveCivit</button>
            </form>
            <div className="border-y border-border-primary py-10 text-center text-text-muted text-sm">Results open on CivArchive. To attach the exact SHA page to an owned file, use Link CivArchive on its My Library card.</div>
        </section>
    );
};