// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { CompactionChatResponseContentImpl, CompactionChatResponseContent } from './chat-model';

describe('CompactionChatResponseContent', () => {
    it('round-trips through serialization', () => {
        const original = new CompactionChatResponseContentImpl('anthropic', { block: 'opaque' }, 'summary text');
        const serialized = original.toSerializable();
        expect(serialized.kind).to.equal('compaction');
        const restored = new CompactionChatResponseContentImpl(
            serialized.data.provider, serialized.data.data, serialized.data.summary);
        expect(restored.provider).to.equal('anthropic');
        expect(restored.summary).to.equal('summary text');
        expect(restored.data).to.deep.equal({ block: 'opaque' });
    });
    it('produces a compaction language model message', () => {
        const content = new CompactionChatResponseContentImpl('openai-responses', { item: 'x' });
        const message = content.toLanguageModelMessage();
        expect(message).to.deep.equal({ actor: 'ai', type: 'compaction', provider: 'openai-responses', data: { item: 'x' }, summary: undefined });
    });
    it('is excluded from plain-text history but offers a display string', () => {
        const content = new CompactionChatResponseContentImpl('anthropic', {}, 'sum');
        expect(content.asString()).to.equal(undefined);
        expect(content.asDisplayString()).to.equal('sum');
        expect(CompactionChatResponseContent.is(content)).to.equal(true);
    });
});
