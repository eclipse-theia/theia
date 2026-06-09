// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    TRANSCRIPT_OVERLAY_STATE_KEYS,
    TranscriptOverlayState,
    bindTranscriptOverlayStateAccessors,
} from './mobile-projects-transcript-overlay-state';

type PanelWithTranscriptState = {
    transcriptState: TranscriptOverlayState;
    transcriptSheet?: HTMLElement | undefined;
    transcriptComposerDraft?: string;
    transcriptFollowUpQueue?: TranscriptOverlayState['transcriptFollowUpQueue'];
};

describe('mobile-projects-transcript-overlay-state', () => {

    it('binds writable transcript fields through panel accessors', () => {
        const host: PanelWithTranscriptState = { transcriptState: new TranscriptOverlayState() };
        bindTranscriptOverlayStateAccessors(host, host.transcriptState);

        const sheet = {} as HTMLElement;
        host.transcriptSheet = sheet;
        host.transcriptComposerDraft = 'draft';

        expect(host.transcriptState.transcriptSheet).to.equal(sheet);
        expect(host.transcriptState.transcriptComposerDraft).to.equal('draft');
        expect(host.transcriptSheet).to.equal(sheet);
        expect(host.transcriptComposerDraft).to.equal('draft');
    });

    it('binds readonly transcript collections without setters', () => {
        const host: PanelWithTranscriptState = { transcriptState: new TranscriptOverlayState() };
        bindTranscriptOverlayStateAccessors(host, host.transcriptState);

        expect(host.transcriptFollowUpQueue).to.equal(host.transcriptState.transcriptFollowUpQueue);
        const descriptor = Object.getOwnPropertyDescriptor(host, 'transcriptFollowUpQueue');
        expect(descriptor?.get).to.be.a('function');
        expect(descriptor?.set).to.equal(undefined);
    });

    it('binds every transcript overlay state key onto the panel host', () => {
        const host: PanelWithTranscriptState = { transcriptState: new TranscriptOverlayState() };
        bindTranscriptOverlayStateAccessors(host, host.transcriptState);
        for (const key of TRANSCRIPT_OVERLAY_STATE_KEYS) {
            expect(Object.prototype.hasOwnProperty.call(host, key), key).to.equal(true);
        }
    });
});
