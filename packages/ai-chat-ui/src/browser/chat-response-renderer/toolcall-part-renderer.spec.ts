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
import { condenseArguments, formatArgsForTooltip } from './toolcall-utils';

describe('condenseArguments', () => {

    it('returns undefined for empty object', () => {
        expect(condenseArguments('{}')).to.be.undefined;
    });

    it('returns undefined for whitespace-only string', () => {
        expect(condenseArguments('   ')).to.be.undefined;
    });

    it('returns undefined for empty string', () => {
        expect(condenseArguments('')).to.be.undefined;
    });

    it('returns the raw string (possibly truncated) for invalid JSON', () => {
        expect(condenseArguments('not valid json')).to.equal('not valid json');
        expect(condenseArguments('{invalid}')).to.equal('{invalid}');
    });

    it('condenses single string parameter as value only', () => {
        const result = condenseArguments('{"query": "search term"}');
        expect(result).to.equal('search term');
    });

    it('shows all key-value pairs for multiple parameters', () => {
        const result = condenseArguments('{"query": "search term", "limit": 10}');
        expect(result).to.equal('query: search term, limit: 10');
    });

    it('truncates long path value at 30 chars', () => {
        const longPath = '/very/long/file/path/to/something.ts';
        const result = condenseArguments(`{"path": "${longPath}"}`);
        expect(result).to.equal('/very/long/file/path/to/someth\u2026');
    });

    it('shows all key-value pairs for multiple parameters', () => {
        const result = condenseArguments('{"path": "/some/path", "mode": "read"}');
        expect(result).to.equal('path: /some/path, mode: read');
    });

    it('shows {\u2026} for single nested object param', () => {
        const result = condenseArguments('{"config": {"nested": true}}');
        expect(result).to.equal('{\u2026}');
    });

    it('shows [\u2026] for single array param', () => {
        const result = condenseArguments('{"items": [1, 2, 3]}');
        expect(result).to.equal('[\u2026]');
    });

    it('shows number value only for single param', () => {
        const result = condenseArguments('{"count": 42}');
        expect(result).to.equal('42');
    });

    it('shows boolean value only for single param', () => {
        const result = condenseArguments('{"enabled": true}');
        expect(result).to.equal('true');
    });

    it('shows null value only for single param', () => {
        const result = condenseArguments('{"value": null}');
        expect(result).to.equal('null');
    });

    it('shows all key-value pairs for multiple mixed parameters', () => {
        const result = condenseArguments('{"config": {"nested": true}, "debug": true}');
        expect(result).to.equal('config: {\u2026}, debug: true');
    });

    it('shows all key-value pairs for multiple short parameters', () => {
        const result = condenseArguments('{"a": "1", "b": "2"}');
        expect(result).to.equal('a: 1, b: 2');
    });

    it('truncates total output exceeding 80 chars with \u2026', () => {
        const veryLongPath = '/this/is/a/very/long/path/that/exceeds/eighty/characters/total/length/somefile.ts';
        const result = condenseArguments(`{"path": "${veryLongPath}"}`);
        expect(result).to.not.be.undefined;
        expect(result!.length).to.be.at.most(81);
        expect(result!.endsWith('\u2026')).to.be.true;
    });

    it('truncates string values longer than 30 chars', () => {
        const longValue = 'abcdefghijklmnopqrstuvwxyz12345678';
        const result = condenseArguments(`{"key": "${longValue}"}`);
        expect(result).to.equal('abcdefghijklmnopqrstuvwxyz1234\u2026');
    });

    it('handles top-level array', () => {
        const result = condenseArguments('[1, 2, 3]');
        expect(result).to.equal('[1,2,3]');
    });

    it('handles top-level string', () => {
        const result = condenseArguments('"hello"');
        expect(result).to.equal('"hello"');
    });

    it('handles top-level number', () => {
        const result = condenseArguments('42');
        expect(result).to.equal('42');
    });

    it('truncates long top-level array', () => {
        const longArray = JSON.stringify(Array(50).fill('item'));
        const result = condenseArguments(longArray);
        expect(result).to.not.be.undefined;
        expect(result!.length).to.be.at.most(81);
        expect(result!.endsWith('\u2026')).to.be.true;
    });

});

describe('formatArgsForTooltip', () => {

    it('renders short single-line args as inline code', () => {
        const args = JSON.stringify({ path: 'test.ts' });
        const result = formatArgsForTooltip(args);
        expect(result.value).to.contain('**path:** `test.ts`');
        expect(result.value).to.not.contain('```');
    });

    it('renders long single-line string as inline code (no newlines)', () => {
        const longPath = 'src/browser/chat-response-renderer/toolcall-utils.ts';
        const args = JSON.stringify({ path: longPath });
        const result = formatArgsForTooltip(args);
        expect(result.value).to.contain(`**path:** \`${longPath}\``);
        expect(result.value).to.not.contain('```');
    });

    it('renders multi-line string as code block', () => {
        const multiLine = 'line one\nline two\nline three';
        const args = JSON.stringify({ content: multiLine });
        const result = formatArgsForTooltip(args);
        expect(result.value).to.contain('**content:**');
        expect(result.value).to.contain('```\n');
        expect(result.value).to.contain(multiLine);
    });

    it('renders JSON object value as code block (serialization produces newlines)', () => {
        const args = JSON.stringify({ config: { nested: true, key: 'value' } });
        const result = formatArgsForTooltip(args);
        expect(result.value).to.contain('**config:**');
        expect(result.value).to.contain('```');
    });

    it('renders array value as code block (serialization produces newlines)', () => {
        const bigArray = Array.from({ length: 5 }, (_, i) => i);
        const args = JSON.stringify({ data: bigArray });
        const result = formatArgsForTooltip(args);
        expect(result.value).to.contain('**data:**');
        expect(result.value).to.contain('```');
    });

    it('renders simple non-string values as inline code (no code blocks)', () => {
        const args = '{"count": 42, "enabled": true, "value": null}';
        const result = formatArgsForTooltip(args);
        expect(result.value).to.contain('**count:** `42`');
        expect(result.value).to.contain('**enabled:** `true`');
        expect(result.value).to.contain('**value:** `null`');
        expect(result.value).to.not.contain('```');
    });

    it('renders mixed single-line and multi-line values correctly', () => {
        const args = JSON.stringify({ path: 'test.ts', content: 'line1\nline2' });
        const result = formatArgsForTooltip(args);
        expect(result.value).to.contain('**path:** `test.ts`');
        expect(result.value).to.contain('**content:**');
        expect(result.value).to.contain('```');
    });

    it('falls back to code block for short unparseable JSON', () => {
        const invalidJson = 'not json at all';
        const result = formatArgsForTooltip(invalidJson);
        expect(result.value).to.contain('```');
        expect(result.value).to.contain('not json at all');
    });

    it('falls back to code block for multi-line unparseable JSON', () => {
        const invalidJson = 'not json\nat all';
        const result = formatArgsForTooltip(invalidJson);
        expect(result.value).to.contain('```');
        expect(result.value).to.contain(invalidJson);
    });

    it('handles top-level non-object parsed value as code block', () => {
        const longString = '"a string that is longer than fifty characters total and keeps going"';
        expect(longString.length).to.be.greaterThan(50);
        const result = formatArgsForTooltip(longString);
        expect(result.value).to.contain('```');
        expect(result.value).to.contain('a string that is longer than fifty characters total and keeps going');
    });

    it('handles top-level array as code block (serialization produces newlines)', () => {
        const args = JSON.stringify([1, 2, 3]);
        const result = formatArgsForTooltip(args);
        expect(result.value).to.contain('```');
    });

    it('separates top-level entries with horizontal rules', () => {
        const args = JSON.stringify({ path: 'test.ts', enabled: true });
        const result = formatArgsForTooltip(args);
        expect(result.value).to.contain('---');
    });

    it('renders primitive array as JSON code block', () => {
        const args = JSON.stringify({ tags: ['a', 'b', 'c'] });
        const result = formatArgsForTooltip(args);
        expect(result.value).to.contain('**tags:**');
        expect(result.value).to.contain('```');
        expect(result.value).to.contain('"a"');
        expect(result.value).to.contain('"b"');
    });

    it('expands array of objects with string values into sections', () => {
        const args = JSON.stringify({
            replacements: [
                { oldContent: 'line one\nline two', newContent: 'line three\nline four' }
            ]
        });
        const result = formatArgsForTooltip(args);
        expect(result.value).to.contain('**oldContent:**');
        expect(result.value).to.contain('**newContent:**');
        expect(result.value).to.contain('line one\nline two');
        expect(result.value).to.contain('line three\nline four');
    });

    it('renders short strings as code blocks inside array items', () => {
        const args = JSON.stringify({
            replacements: [
                { oldContent: '// 2024', newContent: '// 2025' }
            ]
        });
        const result = formatArgsForTooltip(args);
        expect(result.value).to.contain('**oldContent:**');
        expect(result.value).to.contain('**newContent:**');
        expect(result.value).to.contain('// 2024');
        expect(result.value).to.contain('// 2025');
        // Both values should be in code blocks, not inline code
        const codeBlockCount = (result.value.match(/```/g) || []).length;
        expect(codeBlockCount).to.be.greaterThanOrEqual(4); // 2 code blocks = 4 fences
    });

    it('numbers array items when there are multiple', () => {
        const args = JSON.stringify({
            replacements: [
                { old: 'aaa\nbbb', new: 'ccc\nddd' },
                { old: 'eee\nfff', new: 'ggg\nhhh' }
            ]
        });
        const result = formatArgsForTooltip(args);
        expect(result.value).to.contain('\\[0\\]');
        expect(result.value).to.contain('\\[1\\]');
    });

});
