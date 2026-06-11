// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    resolveTranscriptStreamingCoalesceDelayMs,
    TRANSCRIPT_STREAMING_OFF_BOTTOM_COALESCE_MS,
} from './qaap-transcript-streaming-coalesce';

describe('qaap-transcript-streaming-coalesce', () => {

    it('resolveTranscriptStreamingCoalesceDelayMs stays at 0 near the bottom', () => {
        expect(resolveTranscriptStreamingCoalesceDelayMs(true)).to.equal(0);
    });

    it('resolveTranscriptStreamingCoalesceDelayMs caps off-bottom updates on coarse pointers', () => {
        (global as unknown as { window: typeof globalThis }).window = globalThis;
        const originalMatchMedia = globalThis.matchMedia;
        Object.defineProperty(globalThis, 'matchMedia', {
            configurable: true,
            value: (query: string) => ({
                matches: query === '(pointer: coarse)',
                media: query,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
            }),
        });
        try {
            expect(resolveTranscriptStreamingCoalesceDelayMs(false)).to.equal(TRANSCRIPT_STREAMING_OFF_BOTTOM_COALESCE_MS);
        } finally {
            if (originalMatchMedia) {
                Object.defineProperty(globalThis, 'matchMedia', {
                    configurable: true,
                    value: originalMatchMedia,
                });
            }
        }
    });
});
