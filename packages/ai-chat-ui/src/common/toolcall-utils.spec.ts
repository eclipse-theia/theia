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

        it('should handle escaped quotes in complete JSON', () => {
            // With complete JSON, JSON.parse handles escapes correctly
            const result = extractJsonStringField('{"cmd": "echo \\"hello\\""}', 'cmd');
            expect(result).to.equal('echo "hello"');
        });

        it('should unescape escaped quotes in partial JSON', () => {
            const result = extractJsonStringField('{"cmd": "echo \\"hello', 'cmd');
            expect(result).to.equal('echo "hello');
        });
    });

    describe('parse/scan boundary', () => {
        it('should unescape via JSON.parse when complete JSON has trailing whitespace', () => {
            const result = extractJsonStringField('{"cmd": "echo \\"hello\\""}\n', 'cmd');
            expect(result).to.equal('echo "hello"');
        });

        it('should extract by scanning when JSON ends with a brace but is still incomplete', () => {
            const result = extractJsonStringField('{"path": "src/index.ts", "meta": {"x": "y"}', 'path');
            expect(result).to.equal('src/index.ts');
        });

        it('should return undefined for a complete array without the field', () => {
            const result = extractJsonStringField('[{"path": "src/index.ts"}]', 'other');
            expect(result).to.be.undefined;
        });

        it('should return undefined for an incomplete array, which has no top-level field', () => {
            const result = extractJsonStringField('[{"path": "src/index.ts"', 'path');
            expect(result).to.be.undefined;
        });
    });

    describe('top-level fields only (streaming)', () => {
        it('should ignore a matching key inside a nested object', () => {
            const result = extractJsonStringField('{"meta": {"path": "inner.ts"}, "path": "outer.ts', 'path');
            expect(result).to.equal('outer.ts');
        });

        it('should ignore a matching key inside a nested array of objects', () => {
            const result = extractJsonStringField('{"edits": [{"path": "inner.ts"}], "path": "outer.ts', 'path');
            expect(result).to.equal('outer.ts');
        });

        it('should ignore a matching key inside a string value', () => {
            const result = extractJsonStringField('{"content": "{\\"path\\": \\"inner.ts\\"}", "path": "outer.ts', 'path');
            expect(result).to.equal('outer.ts');
        });

        it('should return undefined when the field only occurs nested', () => {
            const result = extractJsonStringField('{"meta": {"path": "inner.ts"}, "content": "abc', 'path');
            expect(result).to.be.undefined;
        });

        it('should return undefined while a nested object is still streaming', () => {
            const result = extractJsonStringField('{"meta": {"path": "inner.ts', 'path');
            expect(result).to.be.undefined;
        });

        it('should return undefined when the top-level field is not a string', () => {
            const result = extractJsonStringField('{"path": 42, "content": "abc', 'path');
            expect(result).to.be.undefined;
        });

        it('should extract a field that follows a non-string top-level value', () => {
            const result = extractJsonStringField('{"line": 42, "path": "src/index.ts', 'path');
            expect(result).to.equal('src/index.ts');
        });

        it('should extract a field that follows a nested object', () => {
            const result = extractJsonStringField('{"meta": {"a": {"b": "c"}}, "path": "src/index.ts', 'path');
            expect(result).to.equal('src/index.ts');
        });

        it('should not match a key whose name merely ends with the field name', () => {
            const result = extractJsonStringField('{"filepath": "wrong.ts", "path": "right.ts', 'path');
            expect(result).to.equal('right.ts');
        });
    });

    describe('escapes in streaming values', () => {
        it('should not end the value at an escaped quote', () => {
            const result = extractJsonStringField('{"path": "a\\"b", "other": "x', 'path');
            expect(result).to.equal('a"b');
        });

        it('should unescape backslashes in a streaming Windows path', () => {
            const result = extractJsonStringField('{"path": "C:\\\\Users\\\\me', 'path');
            expect(result).to.equal('C:\\Users\\me');
        });

        it('should drop a trailing incomplete escape', () => {
            const result = extractJsonStringField('{"path": "a\\', 'path');
            expect(result).to.equal('a');
        });

        it('should drop a trailing incomplete unicode escape', () => {
            const result = extractJsonStringField('{"path": "a\\u00', 'path');
            expect(result).to.equal('a');
        });

        it('should keep a completed escaped backslash at the end of a streaming value', () => {
            const result = extractJsonStringField('{"path": "a\\\\', 'path');
            expect(result).to.equal('a\\');
        });

        it('should keep literal text that looks like an escape', () => {
            const result = extractJsonStringField('{"path": "a\\\\u0041', 'path');
            expect(result).to.equal('a\\u0041');
        });
    });

    describe('large streaming payloads', () => {
        it('should extract a field that follows a very large content value', () => {
            const content = 'x'.repeat(1_000_000);
            const result = extractJsonStringField(`{"content": "${content}", "path": "src/index.ts`, 'path');
            expect(result).to.equal('src/index.ts');
        });
    });

});
