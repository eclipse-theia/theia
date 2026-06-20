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
import { extractJsonStringField } from './toolcall-utils';

describe('extractJsonStringField', () => {
    describe('complete JSON', () => {
        it('should extract a string field from valid JSON', () => {
            const result = extractJsonStringField('{"path": "src/index.ts", "content": "hello"}', 'path');
            expect(result).to.equal('src/index.ts');
        });

        it('should extract a different field from valid JSON', () => {
            const result = extractJsonStringField('{"agentId": "coder", "prompt": "fix the bug"}', 'prompt');
            expect(result).to.equal('fix the bug');
        });

        it('should return undefined when field is not present in valid JSON', () => {
            const result = extractJsonStringField('{"name": "test"}', 'path');
            expect(result).to.be.undefined;
        });

        it('should return undefined when field value is not a string', () => {
            const result = extractJsonStringField('{"count": 42}', 'count');
            expect(result).to.be.undefined;
        });
    });

    describe('incomplete JSON (streaming)', () => {
        it('should extract field from JSON missing closing brace', () => {
            const result = extractJsonStringField('{"path": "src/index.ts"', 'path');
            expect(result).to.equal('src/index.ts');
        });

        it('should extract field from JSON with missing closing quote on value', () => {
            const result = extractJsonStringField('{"path": "src/index.ts', 'path');
            expect(result).to.equal('src/index.ts');
        });

        it('should extract partial value mid-stream', () => {
            const result = extractJsonStringField('{"command": "git st', 'command');
            expect(result).to.equal('git st');
        });

        it('should return empty string when only the key and opening quote are present', () => {
            const result = extractJsonStringField('{"path": "', 'path');
            expect(result).to.equal('');
        });

        it('should handle JSON without spaces around colon', () => {
            const result = extractJsonStringField('{"path":"src/utils.ts', 'path');
            expect(result).to.equal('src/utils.ts');
        });

        it('should extract first field when additional fields follow incomplete', () => {
            const result = extractJsonStringField('{"path": "src/index.ts", "content": "hel', 'path');
            expect(result).to.equal('src/index.ts');
        });

        it('should extract the second field from partial JSON', () => {
            const result = extractJsonStringField('{"agentId": "coder", "prompt": "fix the b', 'prompt');
            expect(result).to.equal('fix the b');
        });
    });

    describe('edge cases', () => {
        it('should return undefined for undefined input', () => {
            const result = extractJsonStringField(undefined, 'path');
            expect(result).to.be.undefined;
        });

        it('should return undefined for empty string input', () => {
            const result = extractJsonStringField('', 'path');
            expect(result).to.be.undefined;
        });

        it('should return undefined when field is not present in partial JSON', () => {
            const result = extractJsonStringField('{"other": "value', 'path');
            expect(result).to.be.undefined;
        });

        it('should return undefined for completely malformed input', () => {
            const result = extractJsonStringField('{path: value}', 'path');
            expect(result).to.be.undefined;
        });

        it('should return undefined for partial key only', () => {
            const result = extractJsonStringField('{"pat', 'path');
            expect(result).to.be.undefined;
        });

        it('should handle escaped quotes - regex stops at first unescaped quote', () => {
            // With complete JSON, JSON.parse handles escapes correctly
            const result = extractJsonStringField('{"cmd": "echo \\"hello\\""}', 'cmd');
            expect(result).to.equal('echo "hello"');
        });

        it('should handle escaped quotes in partial JSON - regex captures up to first quote', () => {
            // With incomplete JSON, regex stops at the first unescaped quote character
            const result = extractJsonStringField('{"cmd": "echo \\"hello', 'cmd');
            expect(result).to.equal('echo \\');
        });
    });
});
