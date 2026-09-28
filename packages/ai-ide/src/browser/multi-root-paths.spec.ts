// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { ILogger, OS, PreferenceService } from '@theia/core';
import { URI } from '@theia/core/lib/common/uri';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { Container } from '@theia/core/shared/inversify';
import { AiConfigurationService } from '@theia/ai-core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { SearchInWorkspaceService, SearchInWorkspaceCallbacks } from '@theia/search-in-workspace/lib/browser/search-in-workspace-service';
import { SearchInWorkspaceResult } from '@theia/search-in-workspace/lib/common/search-in-workspace-interface';
import { ShellExecutionRequest, ShellExecutionServer } from '@theia/ai-terminal/lib/common/shell-execution-server';
import { ShellExecutionTool } from '@theia/ai-terminal/lib/browser/shell-execution-tool';
import { ShellCommandPermissionService } from '@theia/ai-terminal/lib/browser/shell-command-permission-service';
import { Minimatch } from 'minimatch';
import { FindFilesByPattern, GetWorkspaceFileList, WorkspaceFunctionScope } from './workspace-functions';
import { WorkspaceSearchProvider } from './workspace-search-provider';

disableJSDOM();

/**
 * Regression tests for https://github.com/eclipse-theia/theia/issues/17612: in a multi-root workspace,
 * paths that one tool or variable emits must be accepted by the others and refer to the same file.
 *
 * The workspace roots, in workspace order:
 * - `/ws/theia` and `/ws/other`: plain roots;
 * - `/y/app` and `/x/app`: roots sharing a basename, listed so that workspace order differs from URI sort order;
 * - `/ws/theia/packages/nested`: a root nested in `/ws/theia`.
 *
 * The `/ws/theia/other` folder is named like the `/ws/other` root.
 *
 * Where a fix may change how paths are displayed (e.g. `x/app/...` for a duplicate basename), the tests check
 * that the output resolves back to the right file rather than asserting a particular string.
 */
describe('Multi-root path consistency (#17612)', () => {

    const ROOTS = [
        'file:///ws/theia',
        'file:///ws/other',
        'file:///y/app',
        'file:///x/app',
        'file:///ws/theia/packages/nested'
    ];

    /** The files that exist, as found by a search in each root. */
    const FILES = [
        'file:///ws/theia/packages/core/a.ts',
        'file:///ws/theia/other/c.md',
        'file:///ws/theia/packages/nested/n.ts',
        'file:///ws/other/b.ts',
        'file:///x/app/shared.ts',
        'file:///y/app/shared.ts',
        'file:///y/app/only-here.ts'
    ];

    let container: Container;
    let workspaceService: WorkspaceService;
    let workspaceScope: WorkspaceFunctionScope;

    let originalIsWindows: boolean;
    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        disableJSDOM();
    });
    beforeEach(() => {
        // Paths are rendered with `Path.fsPath()`, which branches on the backend OS.
        originalIsWindows = OS.backend.isWindows;
        OS.backend.isWindows = false;
    });
    afterEach(() => {
        OS.backend.isWindows = originalIsWindows;
    });

    /** Mimics ripgrep: the files under the requested root that match the include and not the exclude globs, relative to that root. */
    const makeFileSearchService = (files = FILES): FileSearchService => ({
        find: async (_searchPattern: string, options: FileSearchService.Options) => {
            const rootUri = new URI(options.rootUris![0]);
            const includes = (options.includePatterns ?? []).map(pattern => new Minimatch(pattern, { dot: true }));
            const excludes = (options.excludePatterns ?? []).map(pattern => new Minimatch(pattern, { dot: true }));
            return files.filter(file => {
                const relativePath = rootUri.relative(new URI(file))?.toString();
                return relativePath !== undefined
                    && (includes.length === 0 || includes.some(matcher => matcher.match(relativePath)))
                    && !excludes.some(matcher => matcher.match(relativePath));
            }).slice(0, options.limit);
        }
    } as unknown as FileSearchService);

    /** Reports a match in every file under the searched roots. */
    const makeSearchInWorkspaceService = (searchedRoots: string[][]): SearchInWorkspaceService => ({
        searchWithCallback: async (_query: string, rootUris: string[], callbacks: SearchInWorkspaceCallbacks) => {
            searchedRoots.push(rootUris);
            const searchId = 1;
            setTimeout(() => {
                for (const file of FILES) {
                    if (rootUris.some(root => new URI(root).isEqualOrParent(new URI(file)))) {
                        const result: SearchInWorkspaceResult = { root: '', fileUri: file, matches: [{ line: 1, character: 1, length: 1, lineText: 'match' }] };
                        callbacks.onResult(searchId, result);
                    }
                }
                callbacks.onDone(searchId);
            });
            return searchId;
        },
        cancel: () => { }
    } as unknown as SearchInWorkspaceService);

    beforeEach(() => {
        container = new Container();

        // A real `WorkspaceService` prototype, so that `getRootPrefixedPath` (used by the chat variables) is the production code.
        workspaceService = Object.create(WorkspaceService.prototype, {
            tryGetRoots: { value: () => ROOTS.map(root => ({ resource: new URI(root), isDirectory: true })) },
            onWorkspaceChanged: { value: () => ({ dispose: () => { } }) }
        });

        const fileService = {
            exists: async (uri: URI) => FILES.includes(uri.toString()) || ROOTS.includes(uri.toString()),
            resolve: async (uri: URI) => ({ isDirectory: !FILES.includes(uri.toString()), children: [], resource: uri })
        } as unknown as FileService;

        const aiConfigurationService = {
            get: <T>(_name: string, fallback?: T) => fallback,
            ready: Promise.resolve(),
            onDidChangeTrust: () => ({ dispose: () => { } })
        } as unknown as AiConfigurationService;

        const envVariablesServer = {
            getHomeDirUri: async () => 'file:///home/test'
        } as unknown as EnvVariablesServer;

        container.bind(ILogger).to(MockLogger);
        container.bind(WorkspaceService).toConstantValue(workspaceService);
        container.bind(FileService).toConstantValue(fileService);
        container.bind(PreferenceService).toConstantValue({ get: <T>(_path: string, defaultValue: T) => defaultValue });
        container.bind(AiConfigurationService).toConstantValue(aiConfigurationService);
        container.bind(EnvVariablesServer).toConstantValue(envVariablesServer);
        container.bind(FileSearchService).toConstantValue(makeFileSearchService());
        container.bind(WorkspaceFunctionScope).toSelf().inSingletonScope();
        container.bind(FindFilesByPattern).toSelf();
        container.bind(GetWorkspaceFileList).toSelf();

        workspaceScope = container.get(WorkspaceFunctionScope);
    });

    const resolve = async (path: string): Promise<string> => (await workspaceScope.resolveAccessiblePath(path)).toString();

    const findFiles = async (args: object): Promise<{ files?: string[]; truncated?: boolean; error?: string }> =>
        JSON.parse(await container.get(FindFilesByPattern).getTool().handler(JSON.stringify(args), undefined) as string);

    describe('findFilesByPattern', () => {

        it('accepts a root-prefixed glob, as returned in its own results (B1)', async () => {
            const result = await findFiles({ pattern: 'theia/packages/core/**/*.ts' });
            expect(result.files).to.have.length(1);
            expect(await resolve(result.files![0])).to.equal('file:///ws/theia/packages/core/a.ts');
        });

        it('finds a file that exists only in the second root of a duplicate basename (A1)', async () => {
            const result = await findFiles({ pattern: '**/only-here.ts' });
            expect(result.files).to.have.length(1);
            expect(await resolve(result.files![0])).to.equal('file:///y/app/only-here.ts');
        });

        it('returns paths that resolve to distinct files for roots sharing a basename (A1, A2)', async () => {
            const result = await findFiles({ pattern: '**/shared.ts' });
            const resolved = await Promise.all((result.files ?? []).map(resolve));
            expect(resolved).to.have.members(['file:///x/app/shared.ts', 'file:///y/app/shared.ts']);
        });

        it('returns paths that resolve back to the file when searchRoot is in the workspace (B2)', async () => {
            const result = await findFiles({ pattern: '**/*.ts', searchRoot: 'theia/packages/core' });
            expect(result.error).to.be.undefined;
            expect(result.files).to.have.length(1);
            expect(await resolve(result.files![0])).to.equal('file:///ws/theia/packages/core/a.ts');
        });

        it('applies a root-prefixed exclude to that root only', async () => {
            const result = await findFiles({ pattern: '**/shared.ts', exclude: ['x/app/**'] });
            const resolved = await Promise.all((result.files ?? []).map(resolve));
            expect(resolved).to.deep.equal(['file:///y/app/shared.ts']);
        });

        it('includes files of a nested root when searching the outer root only', async () => {
            const result = await findFiles({ pattern: 'theia/packages/**/*.ts' });
            const resolved = await Promise.all((result.files ?? []).map(resolve));
            expect(resolved).to.have.members(['file:///ws/theia/packages/core/a.ts', 'file:///ws/theia/packages/nested/n.ts']);
        });

        it('searches a folder named like a root in every root', async () => {
            const result = await findFiles({ pattern: 'other/**/*.md' });
            const resolved = await Promise.all((result.files ?? []).map(resolve));
            expect(resolved).to.deep.equal(['file:///ws/theia/other/c.md']);
        });

        it('excludes a folder named like a root in every root', async () => {
            const result = await findFiles({ pattern: '**/*.md', exclude: ['other/**'] });
            expect(result.files).to.deep.equal([]);
        });

        it('keeps the escapes of a root-prefixed glob', async () => {
            const result = await findFiles({ pattern: 'theia/packages/core/\\*.ts' });
            expect(result.files).to.deep.equal([]);
        });

        it('reports a file in a nested root only once (C1)', async () => {
            const result = await findFiles({ pattern: '**/n.ts' });
            expect(result.files).to.have.length(1);
            expect(await resolve(result.files![0])).to.equal('file:///ws/theia/packages/nested/n.ts');
        });

        it('reports a file in a nested root that only the glob relative to the outer root matches', async () => {
            const result = await findFiles({ pattern: 'packages/*/n.ts' });
            const resolved = await Promise.all((result.files ?? []).map(resolve));
            expect(resolved).to.deep.equal(['file:///ws/theia/packages/nested/n.ts']);
        });

        it('reports truncated results when files of a nested root fill the limit of the outer root', async () => {
            const nestedFiles = Array.from({ length: 250 }, (_, i) => `file:///ws/theia/packages/nested/f${i}.ts`);
            container.rebind(FileSearchService).toConstantValue(makeFileSearchService([...nestedFiles, ...FILES]));
            const result = await findFiles({ pattern: 'packages/**/*.ts' });
            expect(result.files).to.have.length(200);
            expect(result.truncated).to.be.true;
        });

        it('reports the files of a nested root once without truncating the results', async () => {
            const nestedFiles = Array.from({ length: 150 }, (_, i) => `file:///ws/theia/packages/nested/f${i}.ts`);
            container.rebind(FileSearchService).toConstantValue(makeFileSearchService([...nestedFiles, ...FILES]));
            const result = await findFiles({ pattern: '**/*.ts' });
            expect(result.files).to.have.length(nestedFiles.length + FILES.filter(file => file.endsWith('.ts')).length);
            expect(new Set(result.files).size).to.equal(result.files!.length);
            expect(result.truncated).to.be.undefined;
        });
    });

    describe('getWorkspaceFileList', () => {

        it('lists every workspace root at the top level (A1)', async () => {
            const tool = container.get(GetWorkspaceFileList).getTool();
            const result: Record<string, string> = JSON.parse(await tool.handler(JSON.stringify({ path: '' }), undefined) as string);
            expect(Object.keys(result)).to.have.length(ROOTS.length);
            const resolved = await Promise.all(Object.keys(result).map(resolve));
            expect(resolved).to.have.members(ROOTS);
        });
    });

    describe('searchInWorkspace', () => {

        let searchedRoots: string[][];

        beforeEach(() => {
            searchedRoots = [];
            container.bind(SearchInWorkspaceService).toConstantValue(makeSearchInWorkspaceService(searchedRoots));
            container.bind(WorkspaceSearchProvider).toSelf();
        });

        it('searches every workspace root (A1)', async () => {
            const tool = container.get(WorkspaceSearchProvider).getTool();
            const result: Array<{ file: string }> = JSON.parse(await tool.handler(JSON.stringify({ query: 'match', useRegExp: false }), undefined) as string);

            expect(searchedRoots.flat()).to.include('file:///y/app');
            const resolved = await Promise.all(result.map(entry => resolve(entry.file)));
            expect(resolved).to.include('file:///y/app/only-here.ts');
        });
    });

    describe('chat variable paths', () => {

        it('resolve to the same file in the workspace tools, for every root (A2)', async () => {
            // `getRootPrefixedPath` renders the paths of `#file`, `#openEditors`, `#changeSetSummary` and `#editorContext`.
            for (const file of FILES) {
                const displayed = workspaceService.getRootPrefixedPath(new URI(file));
                expect(await resolve(displayed), `'${displayed}' for ${file}`).to.equal(file);
            }
        });
    });

    describe('shellExecute', () => {

        let executed: ShellExecutionRequest[];

        beforeEach(() => {
            executed = [];
            const shellServer = {
                execute: async (request: ShellExecutionRequest) => {
                    executed.push(request);
                    return { success: true, exitCode: 0, stdout: '', stderr: '', duration: 0, resolvedCwd: request.cwd };
                },
                cancel: async () => true
            } as unknown as ShellExecutionServer;
            container.bind(ShellExecutionServer).toConstantValue(shellServer);
            container.bind(ShellCommandPermissionService).toConstantValue({} as ShellCommandPermissionService);
            container.bind(ShellExecutionTool).toSelf();
        });

        const cwdFor = async (cwd: string): Promise<string | undefined> => {
            await container.get(ShellExecutionTool).getTool().handler(JSON.stringify({ command: 'pwd', description: 'Print the working directory', cwd }), undefined);
            return executed[executed.length - 1]?.cwd;
        };

        it('resolves a root name to the same directory as the workspace tools (A3)', async () => {
            // Workspace order puts `/y/app` first, URI sort order puts `/x/app` first.
            const expected = new URI(await resolve('app')).path.fsPath();
            expect(await cwdFor('app')).to.equal(expected);
        });

        it('accepts the directory forms that the workspace tools accept (D3)', async () => {
            // Root-prefixed, parent-qualified (the only relative form that reaches a shadowed duplicate root) and URI.
            for (const cwd of ['theia/packages', 'y/app', 'file:///ws/other']) {
                const expected = new URI(await resolve(cwd)).path.fsPath();
                expect(await cwdFor(cwd), `cwd '${cwd}'`).to.equal(expected);
            }
        });
    });
});
