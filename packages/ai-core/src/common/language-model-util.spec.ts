// *****************************************************************************
// Copyright (C) 2026 Ericsson and others.
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
import { extractErrorMessageWithCause } from './language-model-util.js';

describe('extractErrorMessageWithCause', () => {

    it('should return the message for a simple error', () => {
        expect(extractErrorMessageWithCause(new Error('boom'))).to.equal('boom');
    });

    it('should append the cause message', () => {
        const cause = new Error('connect ECONNREFUSED 127.0.0.1:11434');
        const error = Object.assign(new Error('fetch failed'), { cause });
        const result = extractErrorMessageWithCause(error);
        expect(result).to.equal('fetch failed | connect ECONNREFUSED 127.0.0.1:11434');
    });

    it('should consume a string cause below the top level', () => {
        // Regression: previously the string branch was only reachable at depth 0, so a string
        // `cause` on an Error was dropped and only "fetch failed" survived.
        const error = Object.assign(new Error('fetch failed'), { cause: 'connect ECONNREFUSED 127.0.0.1:11434' });
        const result = extractErrorMessageWithCause(error);
        expect(result).to.equal('fetch failed | connect ECONNREFUSED 127.0.0.1:11434');
    });

    it('should include the code when not present in the cause message', () => {
        const cause = Object.assign(new Error('getaddrinfo failed'), { code: 'ENOTFOUND' });
        const error = Object.assign(new Error('fetch failed'), { cause });
        const result = extractErrorMessageWithCause(error);
        expect(result).to.equal('fetch failed | getaddrinfo failed: ENOTFOUND');
    });

    it('should walk nested cause chains and de-duplicate', () => {
        const inner = Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' });
        const middle = Object.assign(new Error('fetch failed'), { cause: inner });
        const outer = Object.assign(new Error('fetch failed'), { cause: middle });
        const result = extractErrorMessageWithCause(outer);
        expect(result).to.equal('fetch failed | ETIMEDOUT');
    });

    it('should tolerate cyclic cause chains', () => {
        const a = new Error('a') as Error & { cause?: unknown };
        const b = Object.assign(new Error('b'), { cause: a });
        a.cause = b;
        const result = extractErrorMessageWithCause(a);
        expect(result).to.equal('a | b');
    });
});
