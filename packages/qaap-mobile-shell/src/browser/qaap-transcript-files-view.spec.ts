// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    defaultTranscriptFilesTreePosition,
    filterTranscriptFileTreeEntries,
    isTranscriptFilesTreeStacked,
    isTranscriptPreviewableTextFile,
    resolveTranscriptFilesTreeVisible,
    shouldSkipTranscriptFilesDirectory,
    transcriptFileIconClass,
    type TranscriptFileTreeEntry,
} from './qaap-transcript-files-view';

describe('qaap-transcript-files-view', () => {
    const entry = (name: string, relativePath: string, isDirectory = false): TranscriptFileTreeEntry => ({
        name,
        resourcePath: `file:///repo/${relativePath}`,
        relativePath,
        isDirectory,
    });

    it('skips heavy workspace directories', () => {
        expect(shouldSkipTranscriptFilesDirectory('node_modules')).to.be.true;
        expect(shouldSkipTranscriptFilesDirectory('src')).to.be.false;
    });

    it('filters files by name or relative path', () => {
        const entries = [
            entry('README.md', 'README.md'),
            entry('index.ts', 'src/index.ts'),
            entry('styles.css', 'src/styles.css'),
        ];
        expect(filterTranscriptFileTreeEntries(entries, 'readme')).to.deep.equal([entries[0]]);
        expect(filterTranscriptFileTreeEntries(entries, 'src/')).to.deep.equal([entries[1], entries[2]]);
    });

    it('maps common extensions to codicons', () => {
        expect(transcriptFileIconClass('package.json')).to.equal('codicon-settings-gear');
        expect(transcriptFileIconClass('README.md')).to.equal('codicon-markdown');
        expect(transcriptFileIconClass('src/index.ts')).to.equal('codicon-file-code');
    });

    it('detects previewable text files', () => {
        expect(isTranscriptPreviewableTextFile('README.md')).to.be.true;
        expect(isTranscriptPreviewableTextFile('image.png')).to.be.false;
    });

    it('defaults tree position by viewport width', () => {
        expect(defaultTranscriptFilesTreePosition(1024)).to.equal('side');
        expect(defaultTranscriptFilesTreePosition(480)).to.equal('bottom');
    });

    it('resolves stacked layout from tree position', () => {
        expect(isTranscriptFilesTreeStacked('bottom')).to.be.true;
        expect(isTranscriptFilesTreeStacked('side')).to.be.false;
    });

    it('defaults file tree to visible', () => {
        expect(resolveTranscriptFilesTreeVisible()).to.be.true;
    });
});
