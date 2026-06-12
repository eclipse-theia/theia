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
import { COMMIT_MESSAGE_AGENT_ID } from './commit-message-agent';

// Mirrors the regex used by `packages/ai-chat/src/common/chat-request-parser.ts`.
const AGENT_MENTION_REG = /^@([\w_\-\.]+)(?=(\s|$|\b))/i;

describe('CommitMessageAgent id', () => {

    it('is parseable by the chat request @-mention regex', () => {
        const match = `@${COMMIT_MESSAGE_AGENT_ID} hi`.match(AGENT_MENTION_REG);
        expect(match, `@${COMMIT_MESSAGE_AGENT_ID} should match the chat agent mention regex`).to.not.be.null;
        expect(match![1]).to.equal(COMMIT_MESSAGE_AGENT_ID);
    });

    it('does not contain whitespace (which would break @-mentions)', () => {
        expect(COMMIT_MESSAGE_AGENT_ID).to.not.match(/\s/);
    });
});
