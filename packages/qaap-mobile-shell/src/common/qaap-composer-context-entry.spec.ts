// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { ImageContextVariable } from '@theia/ai-chat/lib/common/image-context-variable';
import {
    buildPendingComposerContextArg,
    composerContextRequests,
    createComposerContextEntry,
    disposeComposerContextEntries,
    hasPendingComposerContextEntries,
    isPendingComposerContextArg,
    revokeComposerContextPreview,
    type StickyComposerContextEntry,
} from './qaap-composer-context-entry';

const FILE_VARIABLE_STUB = {
    id: 'file-provider',
    name: 'file',
    label: 'File',
    description: 'File',
};

describe('qaap-composer-context-entry', () => {

    const finalizedFile: StickyComposerContextEntry = {
        id: 'entry-file',
        request: { variable: FILE_VARIABLE_STUB, arg: 'docs/report.pdf' },
    };

    const finalizedImage: StickyComposerContextEntry = {
        id: 'entry-image',
        request: ImageContextVariable.createRequest({
            name: 'shot.png',
            mimeType: 'image/png',
            data: btoa('ok'),
        }),
    };

    it('buildPendingComposerContextArg and isPendingComposerContextArg round-trip pending ids', () => {
        const arg = buildPendingComposerContextArg('abc-123');
        expect(arg).to.equal('__qaap_pending__:abc-123');
        expect(isPendingComposerContextArg(arg)).to.equal(true);
        expect(isPendingComposerContextArg('docs/report.pdf')).to.equal(false);
        expect(isPendingComposerContextArg(undefined)).to.equal(false);
    });

    it('createComposerContextEntry wraps a request with a generated id', () => {
        const request = { variable: FILE_VARIABLE_STUB, arg: 'README.md' };
        const entry = createComposerContextEntry(request);
        expect(entry.id.length).to.be.greaterThan(0);
        expect(entry.request).to.equal(request);
        expect(entry.pending).to.equal(undefined);
    });

    it('composerContextRequests omits optimistic placeholders and keeps finalized entries', () => {
        const pendingByFlag: StickyComposerContextEntry = {
            id: 'pending-flag',
            pending: true,
            displayName: 'uploading.pdf',
            request: {
                variable: FILE_VARIABLE_STUB,
                arg: buildPendingComposerContextArg('pending-flag'),
            },
        };
        const pendingByArgOnly: StickyComposerContextEntry = {
            id: 'pending-arg',
            request: {
                variable: {
                    id: 'imageContext',
                    name: 'imageContext',
                    label: 'Image',
                    description: 'Image',
                },
                arg: buildPendingComposerContextArg('pending-arg'),
            },
        };

        const requests = composerContextRequests([
            pendingByFlag,
            finalizedFile,
            pendingByArgOnly,
            finalizedImage,
        ]);

        expect(requests).to.deep.equal([finalizedFile.request, finalizedImage.request]);
    });

    it('composerContextRequests returns an empty array for an empty input', () => {
        expect(composerContextRequests([])).to.deep.equal([]);
    });

    it('hasPendingComposerContextEntries detects pending flag or placeholder arg', () => {
        expect(hasPendingComposerContextEntries([])).to.equal(false);
        expect(hasPendingComposerContextEntries([finalizedFile])).to.equal(false);
        expect(hasPendingComposerContextEntries([{
            id: 'x',
            pending: true,
            request: {
                variable: FILE_VARIABLE_STUB,
                arg: buildPendingComposerContextArg('x'),
            },
        }])).to.equal(true);
        expect(hasPendingComposerContextEntries([{
            id: 'y',
            request: {
                variable: FILE_VARIABLE_STUB,
                arg: buildPendingComposerContextArg('y'),
            },
        }])).to.equal(true);
    });

    it('revokeComposerContextPreview revokes blob preview URLs', () => {
        const originalRevoke = URL.revokeObjectURL;
        let revoked: string | undefined;
        URL.revokeObjectURL = url => { revoked = url; };

        try {
            revokeComposerContextPreview({
                id: 'blob-entry',
                localPreviewSrc: 'blob:preview-1',
                request: { variable: FILE_VARIABLE_STUB, arg: 'x' },
            });
            expect(revoked).to.equal('blob:preview-1');

            revoked = undefined;
            revokeComposerContextPreview({
                id: 'data-entry',
                localPreviewSrc: 'data:image/png;base64,abc',
                request: { variable: FILE_VARIABLE_STUB, arg: 'x' },
            });
            expect(revoked).to.equal(undefined);

            revoked = undefined;
            revokeComposerContextPreview(undefined);
            expect(revoked).to.equal(undefined);
        } finally {
            URL.revokeObjectURL = originalRevoke;
        }
    });

    it('disposeComposerContextEntries revokes every blob preview in the tray', () => {
        const originalRevoke = URL.revokeObjectURL;
        const revoked: string[] = [];
        URL.revokeObjectURL = url => { revoked.push(url); };

        try {
            disposeComposerContextEntries([
                {
                    id: 'a',
                    localPreviewSrc: 'blob:a',
                    request: { variable: FILE_VARIABLE_STUB, arg: 'a' },
                },
                finalizedFile,
                {
                    id: 'b',
                    localPreviewSrc: 'blob:b',
                    request: { variable: FILE_VARIABLE_STUB, arg: 'b' },
                },
            ]);
            expect(revoked).to.deep.equal(['blob:a', 'blob:b']);
        } finally {
            URL.revokeObjectURL = originalRevoke;
        }
    });
});
