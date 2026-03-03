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
import { isEmptyToolArgs, normalizeToolArgs } from './chat-tool-request-service';

describe('Tool Arguments Utilities', () => {

    describe('isEmptyToolArgs', () => {
        it('should return true for undefined', () => {
            expect(isEmptyToolArgs(undefined)).to.be.true;
        });

        it('should return true for empty string', () => {
            expect(isEmptyToolArgs('')).to.be.true;
        });

        it('should return true for empty JSON object', () => {
            expect(isEmptyToolArgs('{}')).to.be.true;
        });

        it('should return true for empty JSON object with whitespace', () => {
            expect(isEmptyToolArgs('{ }')).to.be.true;
            expect(isEmptyToolArgs('{  }')).to.be.true;
            expect(isEmptyToolArgs('{\n}')).to.be.true;
            expect(isEmptyToolArgs('{ \n }')).to.be.true;
        });

        it('should return false for non-empty JSON object', () => {
            expect(isEmptyToolArgs('{"key": "value"}')).to.be.false;
            expect(isEmptyToolArgs('{"file": "test.ts"}')).to.be.false;
        });

        it('should return false for JSON array', () => {
            expect(isEmptyToolArgs('[]')).to.be.false;
            expect(isEmptyToolArgs('[1, 2, 3]')).to.be.false;
        });

        it('should return false for invalid JSON', () => {
            expect(isEmptyToolArgs('not json')).to.be.false;
            expect(isEmptyToolArgs('{')).to.be.false;
            expect(isEmptyToolArgs('{"truncated')).to.be.false;
        });

        it('should return false for JSON primitives', () => {
            expect(isEmptyToolArgs('null')).to.be.false;
            expect(isEmptyToolArgs('true')).to.be.false;
            expect(isEmptyToolArgs('42')).to.be.false;
            expect(isEmptyToolArgs('"string"')).to.be.false;
        });
    });

    describe('normalizeToolArgs', () => {
        it('should normalize undefined to empty string', () => {
            expect(normalizeToolArgs(undefined)).to.equal('');
        });

        it('should normalize empty string to empty string', () => {
            expect(normalizeToolArgs('')).to.equal('');
        });

        it('should normalize empty JSON object to empty string', () => {
            expect(normalizeToolArgs('{}')).to.equal('');
            expect(normalizeToolArgs('{ }')).to.equal('');
        });

        it('should preserve non-empty JSON arguments', () => {
            const args = '{"file": "test.ts"}';
            expect(normalizeToolArgs(args)).to.equal(args);
        });

        it('should preserve invalid JSON as-is', () => {
            const args = 'not json';
            expect(normalizeToolArgs(args)).to.equal(args);
        });

        it('should allow matching empty arguments from different representations', () => {
            const fromStream = '{}';
            const fromHandler = '';

            expect(normalizeToolArgs(fromStream)).to.equal(normalizeToolArgs(fromHandler));
        });
    });
});
