// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { LanguageModelStreamResponsePart } from '@theia/ai-core';
import { AbstractStreamingResponseIterator } from './streaming-response-iterator';

class TestIterator extends AbstractStreamingResponseIterator {
    push(part: LanguageModelStreamResponsePart): void {
        this.handleIncoming(part);
    }
}

describe('AbstractStreamingResponseIterator', () => {

    it('drops parts arriving after dispose', async () => {
        const iterator = new TestIterator();
        iterator.push({ content: 'before' });
        iterator.dispose();
        iterator.push({ content: 'after' });

        expect(await iterator.next()).to.deep.equal({ done: false, value: { content: 'before' } });
        expect(await iterator.next()).to.deep.equal({ done: true, value: undefined });
    });

    it('drops parts arriving after the consumer abandons the iteration', async () => {
        const iterator = new TestIterator();
        await iterator.return();
        iterator.push({ content: 'late' });

        expect(await iterator.next()).to.deep.equal({ done: true, value: undefined });
    });
});
