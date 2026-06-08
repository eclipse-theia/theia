// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { ImageContextVariable } from '@theia/ai-chat/lib/common/image-context-variable';
import {
    buildPendingComposerContextArg,
    type StickyComposerContextEntry,
} from '../common/qaap-composer-context-entry';
import {
    resolveStickyComposerContextChip,
    resolveStickyComposerContextEntry,
    resolveDocumentIconClasses,
} from '../browser/qaap-sticky-composer-context-ui';

describe('qaap-sticky-composer-context-ui', () => {

    it('resolveDocumentIconClasses maps common document types', () => {
        expect(resolveDocumentIconClasses('report.pdf')).to.equal('codicon codicon-file-pdf');
        expect(resolveDocumentIconClasses('notes.md')).to.equal('codicon codicon-markdown');
        expect(resolveDocumentIconClasses('archive.zip')).to.equal('codicon codicon-file-zip');
        expect(resolveDocumentIconClasses('readme.txt')).to.equal('codicon codicon-file');
    });

    it('resolveStickyComposerContextChip renders image attachments with preview metadata', () => {
        const request = ImageContextVariable.createRequest({
            name: 'screenshot.png',
            mimeType: 'image/png',
            data: btoa('fake'),
        });
        const view = resolveStickyComposerContextChip(request);
        expect(view.attachmentKind).to.equal('image');
        expect(view.title).to.equal('screenshot.png');
        expect(view.previewSrc).to.equal('data:image/png;base64,ZmFrZQ==');
        expect(view.subtitle).to.equal('PNG');
    });

    it('resolveStickyComposerContextChip renders file attachments with basename title', () => {
        const view = resolveStickyComposerContextChip({
            variable: {
                id: 'file-provider',
                name: 'file',
                label: 'File',
                description: 'File',
            },
            arg: 'docs/spec/report.pdf',
        });
        expect(view.attachmentKind).to.equal('file');
        expect(view.title).to.equal('report.pdf');
        expect(view.iconClasses).to.equal('codicon codicon-file-pdf');
    });

    it('resolveStickyComposerContextChip treats image files as image attachments', () => {
        const view = resolveStickyComposerContextChip({
            variable: {
                id: 'file-provider',
                name: 'file',
                label: 'File',
                description: 'File',
            },
            arg: 'uploads/photo.jpg',
        });
        expect(view.attachmentKind).to.equal('image');
        expect(view.title).to.equal('photo.jpg');
    });

    it('resolveStickyComposerContextChip keeps generic context chips separate from attachments', () => {
        const view = resolveStickyComposerContextChip({
            variable: {
                id: 'editorContext',
                name: 'editorContext',
                label: 'Editor',
                description: 'Editor',
            },
            arg: 'src/app.ts',
        });
        expect(view.attachmentKind).to.equal('context');
        expect(view.kind).to.equal('editorContext');
    });

    it('resolveStickyComposerContextEntry renders pending image entries with local blob preview', () => {
        const entry: StickyComposerContextEntry = {
            id: 'img-pending',
            pending: true,
            displayName: 'screenshot.png',
            localPreviewSrc: 'blob:local-preview',
            request: {
                variable: {
                    id: 'imageContext',
                    name: 'imageContext',
                    label: 'Image',
                    description: 'Image',
                },
                arg: buildPendingComposerContextArg('img-pending'),
            },
        };
        const view = resolveStickyComposerContextEntry(entry);
        expect(view.attachmentKind).to.equal('image');
        expect(view.pending).to.equal(true);
        expect(view.title).to.equal('screenshot.png');
        expect(view.previewSrc).to.equal('blob:local-preview');
    });

    it('resolveStickyComposerContextEntry renders pending document files without preview', () => {
        const entry: StickyComposerContextEntry = {
            id: 'doc-pending',
            pending: true,
            displayName: 'spec.pdf',
            request: {
                variable: {
                    id: 'file-provider',
                    name: 'file',
                    label: 'File',
                    description: 'File',
                },
                arg: buildPendingComposerContextArg('doc-pending'),
            },
        };
        const view = resolveStickyComposerContextEntry(entry);
        expect(view.attachmentKind).to.equal('file');
        expect(view.pending).to.equal(true);
        expect(view.title).to.equal('spec.pdf');
        expect(view.iconClasses).to.equal('codicon codicon-file-pdf');
        expect(view.previewSrc).to.equal(undefined);
    });

    it('resolveStickyComposerContextEntry treats pending image files as image attachments', () => {
        const entry: StickyComposerContextEntry = {
            id: 'photo-pending',
            pending: true,
            displayName: 'photo.heic',
            localPreviewSrc: 'blob:heic-preview',
            request: {
                variable: {
                    id: 'file-provider',
                    name: 'file',
                    label: 'File',
                    description: 'File',
                },
                arg: buildPendingComposerContextArg('photo-pending'),
            },
        };
        const view = resolveStickyComposerContextEntry(entry);
        expect(view.attachmentKind).to.equal('image');
        expect(view.pending).to.equal(true);
        expect(view.previewSrc).to.equal('blob:heic-preview');
    });

    it('resolveStickyComposerContextEntry resolves finalized entries like plain requests', () => {
        const request = ImageContextVariable.createRequest({
            name: 'done.png',
            mimeType: 'image/png',
            data: btoa('ok'),
        });
        const entry: StickyComposerContextEntry = {
            id: 'done',
            request,
        };
        const fromEntry = resolveStickyComposerContextEntry(entry);
        const fromRequest = resolveStickyComposerContextChip(request);
        expect(fromEntry).to.deep.equal(fromRequest);
    });
});
