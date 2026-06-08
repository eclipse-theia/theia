// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { MAX_TRANSCRIPT_FOLLOW_UP_QUEUE, TranscriptFollowUpQueue } from './qaap-transcript-follow-up-queue';

describe('qaap-transcript-follow-up-queue', () => {

    it('enqueue and shift preserve FIFO order', () => {
        const queue = new TranscriptFollowUpQueue();
        expect(queue.enqueue('c1', { draft: 'first' })).to.equal(true);
        expect(queue.enqueue('c1', { draft: 'second' })).to.equal(true);
        expect(queue.peek('c1').map(entry => entry.draft)).to.deep.equal(['first', 'second']);
        expect(queue.shift('c1')?.draft).to.equal('first');
        expect(queue.shift('c1')?.draft).to.equal('second');
        expect(queue.shift('c1')).to.equal(undefined);
    });

    it('caps queue length', () => {
        const queue = new TranscriptFollowUpQueue();
        for (let i = 0; i < MAX_TRANSCRIPT_FOLLOW_UP_QUEUE; i++) {
            expect(queue.enqueue('c1', { draft: `m${i}` })).to.equal(true);
        }
        expect(queue.enqueue('c1', { draft: 'overflow' })).to.equal(false);
    });
});
