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
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AnthropicMemoryTool } from './anthropic-memory-tool';

const itUnlessWindows = process.platform === 'win32' ? it.skip : it;

describe('AnthropicMemoryTool', () => {
    let memoryFolder: string;
    /** The local directory the SDK implementation maps the virtual `/memories` directory to. */
    let memoryRoot: string;
    let tool: AnthropicMemoryTool;

    beforeEach(async () => {
        memoryFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'anthropic-memory-test-'));
        memoryRoot = path.join(memoryFolder, 'memories');
        tool = new AnthropicMemoryTool(memoryFolder);
    });

    afterEach(async () => {
        await fs.rm(memoryFolder, { recursive: true, force: true });
    });

    function run(input: object): Promise<string> {
        return tool.execute(JSON.stringify(input));
    }

    function exists(localPath: string): Promise<boolean> {
        return fs.access(localPath).then(() => true, () => false);
    }

    describe('path validation (directory traversal protection)', () => {
        it('rejects paths outside of /memories', async () => {
            const result = await run({ command: 'view', path: '/tmp/foo' });
            expect(result).to.contain('must start with /memories');
        });

        it('maps paths that merely start with the /memories prefix into the memory root', async () => {
            const result = await run({ command: 'create', path: '/memories-evil/foo.txt', file_text: 'x' });
            expect(result).to.contain('File created successfully');
            expect(await exists(path.join(memoryRoot, '-evil', 'foo.txt'))).to.equal(true);
            expect(await exists(path.join(path.dirname(memoryFolder), 'memories-evil'))).to.equal(false);
        });

        it('rejects directory traversal with ../', async () => {
            const result = await run({ command: 'create', path: '/memories/../escape.txt', file_text: 'x' });
            expect(result).to.contain('escape');
            expect(await exists(path.join(memoryFolder, 'escape.txt'))).to.equal(false);
        });

        it('does not allow ..\\ sequences to escape the memory root', async () => {
            await run({ command: 'create', path: '/memories/..\\escape.txt', file_text: 'x' });
            expect(await exists(path.join(memoryFolder, 'escape.txt'))).to.equal(false);
        });

        it('rejects nested directory traversal', async () => {
            const result = await run({ command: 'create', path: '/memories/sub/../../../escape.txt', file_text: 'x' });
            expect(result).to.contain('escape');
        });

        it('treats URL-encoded traversal sequences as literal file names inside the memory root', async () => {
            const result = await run({ command: 'create', path: '/memories/%2e%2e%2fescape.txt', file_text: 'x' });
            expect(result).to.contain('File created successfully');
            expect(await exists(path.join(path.dirname(memoryFolder), 'escape.txt'))).to.equal(false);
        });

        it('rejects traversal in rename old_path and new_path', async () => {
            await run({ command: 'create', path: '/memories/a.txt', file_text: 'x' });
            expect(await run({ command: 'rename', old_path: '/memories/../a.txt', new_path: '/memories/b.txt' })).to.contain('escape');
            expect(await run({ command: 'rename', old_path: '/memories/a.txt', new_path: '/memories/../b.txt' })).to.contain('escape');
        });

        itUnlessWindows('blocks writes through symlinks pointing outside the memory root', async () => {
            await run({ command: 'view', path: '/memories' });
            const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'anthropic-memory-outside-'));
            try {
                await fs.symlink(outside, path.join(memoryRoot, 'link'), 'dir');
                const result = await run({ command: 'create', path: '/memories/link/pwn.txt', file_text: 'x' });
                expect(result).to.contain('symlink');
                expect(await exists(path.join(outside, 'pwn.txt'))).to.equal(false);
            } finally {
                await fs.rm(outside, { recursive: true, force: true });
            }
        });
    });

    describe('create', () => {
        it('creates a file and reports success', async () => {
            const result = await run({ command: 'create', path: '/memories/notes.txt', file_text: 'hello\n' });
            expect(result).to.equal('File created successfully at: /memories/notes.txt');
            const content = await fs.readFile(path.join(memoryRoot, 'notes.txt'), 'utf8');
            expect(content).to.equal('hello\n');
        });

        it('creates parent directories as needed', async () => {
            const result = await run({ command: 'create', path: '/memories/project/sub/notes.txt', file_text: 'x' });
            expect(result).to.equal('File created successfully at: /memories/project/sub/notes.txt');
        });

        it('does not overwrite an existing file', async () => {
            await run({ command: 'create', path: '/memories/notes.txt', file_text: 'first' });
            const result = await run({ command: 'create', path: '/memories/notes.txt', file_text: 'second' });
            expect(result).to.equal('Error: File /memories/notes.txt already exists');
            expect(await fs.readFile(path.join(memoryRoot, 'notes.txt'), 'utf8')).to.equal('first');
        });
    });

    describe('view', () => {
        it('shows file content with right-aligned line numbers', async () => {
            await run({ command: 'create', path: '/memories/notes.txt', file_text: 'Hello World\nThis is line two' });
            const result = await run({ command: 'view', path: '/memories/notes.txt' });
            expect(result).to.equal(
                'Here\'s the content of /memories/notes.txt with line numbers:\n' +
                '     1\tHello World\n' +
                '     2\tThis is line two'
            );
        });

        it('supports view_range', async () => {
            await run({ command: 'create', path: '/memories/notes.txt', file_text: 'one\ntwo\nthree\nfour' });
            const result = await run({ command: 'view', path: '/memories/notes.txt', view_range: [2, 3] });
            expect(result).to.equal(
                'Here\'s the content of /memories/notes.txt with line numbers:\n' +
                '     2\ttwo\n' +
                '     3\tthree'
            );
        });

        it('lists directory contents up to 2 levels, excluding hidden items and node_modules', async () => {
            await run({ command: 'create', path: '/memories/a.txt', file_text: 'hello' });
            await run({ command: 'create', path: '/memories/sub/deep.txt', file_text: 'x' });
            await run({ command: 'create', path: '/memories/sub/deeper/too-deep.txt', file_text: 'x' });
            await fs.writeFile(path.join(memoryRoot, '.secret'), 'hidden');
            await fs.mkdir(path.join(memoryRoot, 'node_modules'));

            const result = await run({ command: 'view', path: '/memories' });
            const lines = result.split('\n');
            expect(lines[0]).to.equal('Here\'re the files and directories up to 2 levels deep in /memories, excluding hidden items and node_modules:');
            const listedPaths = lines.slice(1).map(line => line.split('\t')[1]);
            expect(listedPaths).to.deep.equal([
                '/memories',
                '/memories/a.txt',
                '/memories/sub/',
                '/memories/sub/deep.txt',
                '/memories/sub/deeper/'
            ]);
            expect(lines.find(line => line.endsWith('/memories/a.txt'))).to.match(/^5B\t/);
        });

        it('reports a non-existing path', async () => {
            const result = await run({ command: 'view', path: '/memories/missing.txt' });
            expect(result).to.contain('The path /memories/missing.txt does not exist. Please provide a valid path.');
        });
    });

    describe('str_replace', () => {
        it('replaces unique text and returns a snippet', async () => {
            await run({ command: 'create', path: '/memories/prefs.txt', file_text: 'Favorite color: blue\nFavorite food: pizza' });
            const result = await run({ command: 'str_replace', path: '/memories/prefs.txt', old_str: 'Favorite color: blue', new_str: 'Favorite color: green' });
            expect(result).to.contain('The memory file has been edited.');
            expect(result).to.contain('     1\tFavorite color: green');
            expect(await fs.readFile(path.join(memoryRoot, 'prefs.txt'), 'utf8')).to.equal('Favorite color: green\nFavorite food: pizza');
        });

        it('reports when old_str is not found', async () => {
            await run({ command: 'create', path: '/memories/prefs.txt', file_text: 'something' });
            const result = await run({ command: 'str_replace', path: '/memories/prefs.txt', old_str: 'missing', new_str: 'x' });
            expect(result).to.equal('Error: No replacement was performed, old_str `missing` did not appear verbatim in /memories/prefs.txt.');
        });

        it('reports multiple occurrences with their line numbers', async () => {
            await run({ command: 'create', path: '/memories/prefs.txt', file_text: 'dup\nother\ndup' });
            const result = await run({ command: 'str_replace', path: '/memories/prefs.txt', old_str: 'dup', new_str: 'x' });
            expect(result).to.equal('Error: No replacement was performed. Multiple occurrences of old_str `dup` in lines: 1, 3. Please ensure it is unique');
        });

        it('reports a non-existing file', async () => {
            const result = await run({ command: 'str_replace', path: '/memories/missing.txt', old_str: 'a', new_str: 'b' });
            expect(result).to.equal('Error: The path /memories/missing.txt does not exist. Please provide a valid path.');
        });
    });

    describe('insert', () => {
        it('inserts text after the given line', async () => {
            await run({ command: 'create', path: '/memories/todo.txt', file_text: 'one\ntwo' });
            const result = await run({ command: 'insert', path: '/memories/todo.txt', insert_line: 1, insert_text: 'between\n' });
            expect(result).to.equal('The file /memories/todo.txt has been edited.');
            expect(await fs.readFile(path.join(memoryRoot, 'todo.txt'), 'utf8')).to.equal('one\nbetween\ntwo');
        });

        it('inserts at the beginning for insert_line 0', async () => {
            await run({ command: 'create', path: '/memories/todo.txt', file_text: 'one' });
            await run({ command: 'insert', path: '/memories/todo.txt', insert_line: 0, insert_text: 'zero\n' });
            expect(await fs.readFile(path.join(memoryRoot, 'todo.txt'), 'utf8')).to.equal('zero\none');
        });

        it('rejects an out-of-range insert_line', async () => {
            await run({ command: 'create', path: '/memories/todo.txt', file_text: 'one\ntwo' });
            const result = await run({ command: 'insert', path: '/memories/todo.txt', insert_line: 5, insert_text: 'x' });
            expect(result).to.equal('Error: Invalid `insert_line` parameter: 5. It should be within the range of lines of the file: [0, 2]');
        });

        it('reports a non-existing file', async () => {
            const result = await run({ command: 'insert', path: '/memories/missing.txt', insert_line: 0, insert_text: 'x' });
            expect(result).to.equal('Error: The path /memories/missing.txt does not exist. Please provide a valid path.');
        });
    });

    describe('delete', () => {
        it('deletes a file', async () => {
            await run({ command: 'create', path: '/memories/old.txt', file_text: 'x' });
            const result = await run({ command: 'delete', path: '/memories/old.txt' });
            expect(result).to.equal('Successfully deleted /memories/old.txt');
        });

        it('deletes a directory recursively', async () => {
            await run({ command: 'create', path: '/memories/dir/file.txt', file_text: 'x' });
            const result = await run({ command: 'delete', path: '/memories/dir' });
            expect(result).to.equal('Successfully deleted /memories/dir');
            expect(await exists(path.join(memoryRoot, 'dir'))).to.equal(false);
        });

        it('refuses to delete the memory root itself', async () => {
            const result = await run({ command: 'delete', path: '/memories' });
            expect(result).to.contain('Error:');
            expect(await exists(memoryRoot)).to.equal(true);
        });

        it('reports a non-existing path', async () => {
            const result = await run({ command: 'delete', path: '/memories/missing.txt' });
            expect(result).to.equal('Error: The path /memories/missing.txt does not exist');
        });
    });

    describe('rename', () => {
        it('renames a file', async () => {
            await run({ command: 'create', path: '/memories/draft.txt', file_text: 'x' });
            const result = await run({ command: 'rename', old_path: '/memories/draft.txt', new_path: '/memories/final.txt' });
            expect(result).to.equal('Successfully renamed /memories/draft.txt to /memories/final.txt');
            expect(await fs.readFile(path.join(memoryRoot, 'final.txt'), 'utf8')).to.equal('x');
        });

        it('does not overwrite an existing destination', async () => {
            await run({ command: 'create', path: '/memories/a.txt', file_text: 'a' });
            await run({ command: 'create', path: '/memories/b.txt', file_text: 'b' });
            const result = await run({ command: 'rename', old_path: '/memories/a.txt', new_path: '/memories/b.txt' });
            expect(result).to.equal('Error: The destination /memories/b.txt already exists');
        });

        it('reports a non-existing source', async () => {
            const result = await run({ command: 'rename', old_path: '/memories/missing.txt', new_path: '/memories/x.txt' });
            expect(result).to.equal('Error: The path /memories/missing.txt does not exist');
        });
    });

    describe('robustness', () => {
        it('reports unknown commands', async () => {
            const result = await run({ command: 'format_disk', path: '/memories' });
            expect(result).to.equal('Error: format_disk not implemented');
        });

        it('reports invalid JSON input', async () => {
            const result = await tool.execute('not json');
            expect(result).to.contain('Error: Invalid memory tool input');
        });
    });
});
