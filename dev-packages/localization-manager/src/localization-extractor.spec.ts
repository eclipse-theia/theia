// *****************************************************************************
// Copyright (C) 2021 TypeFox and others.
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

import * as assert from 'assert';
import { extractFromFile, ExtractionOptions } from './localization-extractor';

const TEST_FILE = 'test.ts';
const quiet: ExtractionOptions = { quiet: true };

describe('correctly extracts from file content', () => {

    it('should extract from simple nls.localize() call', async () => {
        const content = 'nls.localize("key", "value")';
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content), {
            'key': 'value'
        });
    });

    it('should extract from nested nls.localize() call', async () => {
        const content = 'nls.localize("nested/key", "value")';
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content), {
            'nested': {
                'key': 'value'
            }
        });
    });

    it('should extract IDs from Command.toLocalizedCommand() call', async () => {
        const content = `
        Command.toLocalizedCommand({
            id: 'command-id1',
            label: 'command-label1'
        });
        Command.toLocalizedCommand({
            id: 'command-id2',
            label: 'command-label2'
        }, 'command-key');
        `;
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content), {
            'command-id1': 'command-label1',
            'command-key': 'command-label2'
        });
    });

    it('should extract category from Command.toLocalizedCommand() call', async () => {
        const content = `
        Command.toLocalizedCommand({
            id: 'id',
            label: 'label',
            category: 'category'
        }, undefined, 'category-key');`;
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content), {
            'id': 'label',
            'category-key': 'category'
        });
    });

    it('should merge different nls.localize() calls', async () => {
        const content = `
        nls.localize('nested/key1', 'value1');
        nls.localize('nested/key2', 'value2');
        `;
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content), {
            'nested': {
                'key1': 'value1',
                'key2': 'value2'
            }
        });
    });

    it('should be able to resolve local references', async () => {
        const content = `
        const a = 'key';
        nls.localize(a, 'value');
        `;
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content), {
            'key': 'value'
        });
    });

    it('should return an error when resolving is not successful', async () => {
        const content = "nls.localize(a, 'value')";
        const errors: string[] = [];
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content, errors, quiet), {});
        assert.deepStrictEqual(errors, [
            "test.ts(1,14): Could not resolve reference to 'a'"
        ]);
    });

    it('should return an error when resolving from an expression', async () => {
        const content = "nls.localize(test.value, 'value');";
        const errors: string[] = [];
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content, errors, quiet), {});
        assert.deepStrictEqual(errors, [
            "test.ts(1,14): 'test.value' is not a string constant"
        ]);
    });

    it('should show error when trying to merge an object and a string', async () => {
        const content = `
        nls.localize('key', 'value');
        nls.localize('key/nested', 'value');
        `.trim();
        const errors: string[] = [];
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content, errors, quiet), {
            'key': 'value'
        });
        assert.deepStrictEqual(errors, [
            "test.ts(2,35): String entry already exists at 'key'"
        ]);
    });

    it('should show error when trying to merge a string into an object', async () => {
        const content = `
        nls.localize('key/nested', 'value');
        nls.localize('key', 'value');
        `.trim();
        const errors: string[] = [];
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content, errors, quiet), {
            'key': {
                'nested': 'value'
            }
        });
        assert.deepStrictEqual(errors, [
            "test.ts(2,28): Multiple translation keys already exist at 'key'"
        ]);
    });

    it('should extract from template literal without expressions', async () => {
        const content = 'nls.localize("key", `template literal value`)';
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content), {
            'key': 'template literal value'
        });
    });

    it('should dedent multiline template literal', async () => {
        const content = [
            'nls.localize("key", `first line',
            '                        second line',
            '                        third line`)'
        ].join('\n');
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content), {
            'key': 'first line\nsecond line\nthird line'
        });
    });

    it('should dedent multiline template literal with blank lines', async () => {
        const content = [
            'nls.localize("key", `first paragraph.',
            '',
            '                        second paragraph.`)'
        ].join('\n');
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content), {
            'key': 'first paragraph.\n\nsecond paragraph.'
        });
    });

    it('should show error for template literals with expressions', async () => {
        const content = 'const name = "World"; nls.localize("key", `Hello ${name}`)';
        const errors: string[] = [];
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content, errors, quiet), {});
        assert.deepStrictEqual(errors, [
            'test.ts(1,42): Template literals with expressions are not supported for localization. ' +
            'Please use the additional arguments of the \'nls.localize\' function to format strings'
        ]);
    });

    it('should extract from string concatenation', async () => {
        const content = 'nls.localize("key", "Hello " + "World")';
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content), {
            'key': 'Hello World'
        });
    });

    it('should extract from multi-part string concatenation', async () => {
        const content = 'nls.localize("key", "part one " + "part two " + "part three")';
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content), {
            'key': 'part one part two part three'
        });
    });

    it('should return an error when concatenation includes a non-string expression', async () => {
        const content = 'nls.localize("key", "hello " + someFunction())';
        const errors: string[] = [];
        assert.deepStrictEqual(await extractFromFile(TEST_FILE, content, errors, quiet), {});
        assert.deepStrictEqual(errors, [
            "test.ts(1,31): 'someFunction()' is not a string constant"
        ]);
    });

});
