// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    resolveTranscriptVirtualMinMessages,
    TRANSCRIPT_VIRTUAL_MIN_MESSAGES,
    TRANSCRIPT_VIRTUAL_MIN_MESSAGES_NARROW,
} from './qaap-transcript-virtual-list-policy';

describe('qaap-transcript-virtual-list-policy', () => {

    it('resolveTranscriptVirtualMinMessages uses the narrow threshold when the matcher says narrow', () => {
        expect(resolveTranscriptVirtualMinMessages(() => true)).to.equal(TRANSCRIPT_VIRTUAL_MIN_MESSAGES_NARROW);
    });

    it('resolveTranscriptVirtualMinMessages keeps the desktop threshold on wide viewports', () => {
        expect(resolveTranscriptVirtualMinMessages(() => false)).to.equal(TRANSCRIPT_VIRTUAL_MIN_MESSAGES);
    });
});
