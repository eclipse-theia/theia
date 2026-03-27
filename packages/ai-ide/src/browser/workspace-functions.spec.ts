// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { CancellationTokenSource, PreferenceService } from '@theia/core';
import {
    GetWorkspaceDirectoryStructure,
    FileContentFunction,
    GetWorkspaceFileList,
    FileDiagnosticProvider,
    WorkspaceFunctionScope,
    FindFilesByPattern
} from './workspace-functions';
import { ToolInvocationContext } from '@theia/ai-core';
import { Container } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileOperationError, FileOperationResult } from '@theia/filesystem/lib/common/files';
import { URI } from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ProblemManager } from '@theia/markers/lib/browser';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';

disableJSDOM();

describe('Workspace Functions Cancellation Tests', () => {
    let cancellationTokenSource: CancellationTokenSource;
    let mockCtx: ToolInvocationContext;
    let container: Container;

    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        // Disable JSDOM after all tests
        disableJSDOM();
    });

    beforeEach(() => {
        cancellationTokenSource = new CancellationTokenSource();

        // Setup mock context
        mockCtx = {
            cancellationToken: cancellationTokenSource.token
        };

        // Create a new container for each test
        container = new Container();

        // Mock dependencies
        const mockWorkspaceService = {
            roots: Promise.resolve([{ resource: new URI('file:///workspace') }]),
            tryGetRoots: () => [{ resource: new URI('file:///workspace') }],
            onWorkspaceChanged: () => ({ dispose: () => { } })
        } as unknown as WorkspaceService;

        const mockFileService = {
            exists: async () => true,
            resolve: async () => ({
                isDirectory: true,
                children: [
                    {
                        isDirectory: true,
                        resource: new URI('file:///workspace/dir'),
                        path: { base: 'dir' }
                    }
                ],
                resource: new URI('file:///workspace')
            }),
            read: async () => ({ value: { toString: () => 'test content' } })
        } as unknown as FileService;

        const mockPreferenceService = {
            get: <T>(_path: string, defaultValue: T) => defaultValue
        };

        const mockMonacoWorkspace = {
            getTextDocument: () => undefined
        } as unknown as MonacoWorkspace;

        const mockProblemManager = {
            findMarkers: () => [],
            onDidChangeMarkers: () => ({ dispose: () => { } })
        } as unknown as ProblemManager;

        const mockMonacoTextModelService = {
            createModelReference: async () => ({
                object: {
                    lineCount: 10,
                    getText: () => 'test text'
                },
                dispose: () => { }
            })
        } as unknown as MonacoTextModelService;

        // Register mocks in the container
        container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
        container.bind(FileService).toConstantValue(mockFileService);
        container.bind(PreferenceService).toConstantValue(mockPreferenceService);
        container.bind(MonacoWorkspace).toConstantValue(mockMonacoWorkspace);
        container.bind(ProblemManager).toConstantValue(mockProblemManager);
        container.bind(MonacoTextModelService).toConstantValue(mockMonacoTextModelService);
        container.bind(WorkspaceFunctionScope).toSelf();
        container.bind(GetWorkspaceDirectoryStructure).toSelf();
        container.bind(FileContentFunction).toSelf();
        container.bind(GetWorkspaceFileList).toSelf();
        container.bind(FileDiagnosticProvider).toSelf();
        container.bind(FindFilesByPattern).toSelf();
    });

    afterEach(() => {
        cancellationTokenSource.dispose();
    });

    it('GetWorkspaceDirectoryStructure should respect cancellation token', async () => {
        const getDirectoryStructure = container.get(GetWorkspaceDirectoryStructure);
        cancellationTokenSource.cancel();

        const handler = getDirectoryStructure.getTool().handler;
        const result = await handler(JSON.stringify({}), mockCtx);

        const jsonResponse = typeof result === 'string' ? JSON.parse(result) : result;
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('FileContentFunction should respect cancellation token', async () => {
        const fileContentFunction = container.get(FileContentFunction);
        cancellationTokenSource.cancel();

        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'test.txt' }), mockCtx);

        const jsonResponse = JSON.parse(result as string);
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });

    it('GetWorkspaceFileList should respect cancellation token', async () => {
        const getWorkspaceFileList = container.get(GetWorkspaceFileList);
        cancellationTokenSource.cancel();

        const handler = getWorkspaceFileList.getTool().handler;
        const result = await handler(JSON.stringify({ path: '' }), mockCtx);

        expect(result).to.include('Operation cancelled by user');
    });

    it('GetWorkspaceFileList should check cancellation at multiple points', async () => {
        const getWorkspaceFileList = container.get(GetWorkspaceFileList);

        // We'll let it pass the first check then cancel
        const mockFileService = container.get(FileService);
        const originalResolve = mockFileService.resolve;

        // Mock resolve to cancel the token after it's called
        mockFileService.resolve = async (...args: unknown[]) => {
            const innerResult = await originalResolve.apply(mockFileService, args);
            cancellationTokenSource.cancel();
            return innerResult;
        };

        const handler = getWorkspaceFileList.getTool().handler;
        // Use a path that triggers file resolution (root name + subdirectory)
        const result = await handler(JSON.stringify({ path: 'workspace/dir' }), mockCtx);

        expect(result).to.include('Operation cancelled by user');
    });

    it('FileDiagnosticProvider should respect cancellation token', async () => {
        const fileDiagnosticProvider = container.get(FileDiagnosticProvider);
        cancellationTokenSource.cancel();

        const handler = fileDiagnosticProvider.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'test.txt' }), mockCtx);

        const jsonResponse = JSON.parse(result as string);
        expect(jsonResponse.error).to.equal('Operation cancelled by user');
    });
});

describe('FileContentFunction.getArgumentsShortLabel', () => {
    let container: Container;
    let getArgumentsShortLabel: (args: string) => { label: string; hasMore: boolean } | undefined;

    let disableJSDOMInner: () => void;
    before(() => {
        disableJSDOMInner = enableJSDOM();
    });
    after(() => {
        disableJSDOMInner();
    });

    beforeEach(() => {
        container = new Container();

        const mockWorkspaceService = {
            roots: Promise.resolve([{ resource: new URI('file:///workspace') }]),
            tryGetRoots: () => [{ resource: new URI('file:///workspace') }],
            onWorkspaceChanged: () => ({ dispose: () => { } })
        } as unknown as WorkspaceService;

        const mockFileService = {
            exists: async () => true,
            resolve: async () => ({
                isDirectory: true,
                children: [],
                resource: new URI('file:///workspace')
            }),
            read: async () => ({ value: { toString: () => 'test content' } })
        } as unknown as FileService;

        const mockPreferenceService = {
            get: <T>(_path: string, defaultValue: T) => defaultValue
        };

        const mockMonacoWorkspace = {
            getTextDocument: () => undefined
        } as unknown as MonacoWorkspace;

        container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
        container.bind(FileService).toConstantValue(mockFileService);
        container.bind(PreferenceService).toConstantValue(mockPreferenceService);
        container.bind(MonacoWorkspace).toConstantValue(mockMonacoWorkspace);
        container.bind(WorkspaceFunctionScope).toSelf();
        container.bind(FileContentFunction).toSelf();

        const fileContentFunction = container.get(FileContentFunction);
        const tool = fileContentFunction.getTool();
        getArgumentsShortLabel = tool.getArgumentsShortLabel!;
    });

    it('returns label for valid file argument', () => {
        const result = getArgumentsShortLabel(JSON.stringify({ file: 'src/index.ts' }));
        expect(result).to.deep.equal({ label: 'src/index.ts', hasMore: false });
    });

    it('returns undefined for invalid JSON', () => {
        const result = getArgumentsShortLabel('not valid json');
        expect(result).to.be.undefined;
    });

    it('returns undefined when file key is missing', () => {
        const result = getArgumentsShortLabel(JSON.stringify({ path: 'src/index.ts' }));
        expect(result).to.be.undefined;
    });

    it('returns hasMore true when offset is provided', () => {
        const result = getArgumentsShortLabel(JSON.stringify({ file: 'src/index.ts', offset: 10 }));
        expect(result).to.deep.equal({ label: 'src/index.ts', hasMore: true });
    });

    it('returns hasMore true when limit is provided', () => {
        const result = getArgumentsShortLabel(JSON.stringify({ file: 'src/index.ts', limit: 50 }));
        expect(result).to.deep.equal({ label: 'src/index.ts', hasMore: true });
    });

    it('returns hasMore true when both offset and limit are provided', () => {
        const result = getArgumentsShortLabel(JSON.stringify({ file: 'src/index.ts', offset: 10, limit: 50 }));
        expect(result).to.deep.equal({ label: 'src/index.ts', hasMore: true });
    });
});

describe('FileContentFunction handler', () => {
    let container: Container;
    let fileContentFunction: FileContentFunction;
    // Mutable delegates — tests reassign these directly instead of casting the mock object.
    let mockResolve: () => Promise<unknown>;
    let mockRead: () => Promise<unknown>;
    let mockReadStream: () => Promise<unknown>;
    let mockMonacoWorkspace: MonacoWorkspace;
    let mockPreferenceService: { get: <T>(path: string, defaultValue: T) => T };

    const makeMockStream = (content: string) => {
        const handlers: Record<string, Function> = {};
        // Use setTimeout so the macro-task fires after all pending microtasks
        // (including the await continuation that registers the listeners).
        setTimeout(() => {
            handlers['data']?.(content);
            handlers['end']?.();
        }, 0);
        return {
            on(event: string, cb: Function): void { handlers[event] = cb; },
            pause(): void { },
            resume(): void { },
            destroy(): void { },
            removeListener(): void { }
        };
    };

    let disableJSDOMInner: () => void;
    before(() => {
        disableJSDOMInner = enableJSDOM();
    });
    after(() => {
        disableJSDOMInner();
    });

    beforeEach(() => {
        container = new Container();

        const mockWorkspaceService = {
            roots: Promise.resolve([{ resource: new URI('file:///workspace') }]),
            tryGetRoots: () => [{ resource: new URI('file:///workspace') }],
            onWorkspaceChanged: () => ({ dispose: () => { } })
        } as unknown as WorkspaceService;

        mockResolve = async () => ({
            isFile: true,
            isDirectory: false,
            size: 1024,
            resource: new URI('file:///workspace/test.txt')
        });

        mockRead = async () => ({ value: 'line1\nline2\nline3\nline4\nline5' });

        mockReadStream = async () => ({ value: makeMockStream('line1\nline2\nline3\nline4\nline5') });

        // The mock object is stable across a test; individual methods delegate to
        // the mutable variables above so tests can substitute behaviour without
        // the fragile `(obj as unknown as {…}).method = …` double-cast pattern.
        const mockFileService = {
            exists: async () => true,
            resolve: () => mockResolve(),
            read: () => mockRead(),
            readStream: () => mockReadStream(),
        } as unknown as FileService;

        mockPreferenceService = {
            get: <T>(_path: string, defaultValue: T) => defaultValue
        };

        mockMonacoWorkspace = {
            getTextDocument: () => undefined
        } as unknown as MonacoWorkspace;

        container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
        container.bind(FileService).toConstantValue(mockFileService);
        container.bind(PreferenceService).toConstantValue(mockPreferenceService);
        container.bind(MonacoWorkspace).toConstantValue(mockMonacoWorkspace);
        container.bind(WorkspaceFunctionScope).toSelf();
        container.bind(FileContentFunction).toSelf();

        fileContentFunction = container.get(FileContentFunction);
    });

    it('returns file content when file is within size limit', async () => {
        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'test.txt' }), undefined);
        expect(result).to.equal('line1\nline2\nline3\nline4\nline5');
    });

    it('rejects without reading when on-disk size exceeds limit', async () => {
        // Stat reports 512 KB; default limit is 256 KB
        let readCalled = false;
        mockResolve = async () => ({
            isFile: true,
            isDirectory: false,
            size: 512 * 1024,
            resource: new URI('file:///workspace/big.txt')
        });
        mockRead = async () => {
            readCalled = true;
            return { value: 'should not be read' };
        };

        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'big.txt' }), undefined);

        const parsed = JSON.parse(result as string);
        expect(parsed.error).to.include('size limit');
        expect(parsed.sizeKB).to.equal(512);
        expect(readCalled).to.be.false;
    });

    it('returns editor content when file is open in editor and within size limit', async () => {
        let resolveCalled = false;
        mockResolve = async () => {
            resolveCalled = true;
            return { isFile: true, isDirectory: false, size: 1024, resource: new URI('file:///workspace/open.txt') };
        };
        mockMonacoWorkspace.getTextDocument = () => ({
            getText: () => 'editor content'
        } as unknown as ReturnType<MonacoWorkspace['getTextDocument']>);

        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'open.txt' }), undefined);

        expect(result).to.equal('editor content');
        expect(resolveCalled).to.be.false;
    });

    it('rejects editor content when it exceeds the size limit', async () => {
        const bigContent = 'x'.repeat(512 * 1024);
        mockMonacoWorkspace.getTextDocument = () => ({
            getText: () => bigContent
        } as unknown as ReturnType<MonacoWorkspace['getTextDocument']>);

        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'open.txt' }), undefined);

        const parsed = JSON.parse(result as string);
        expect(parsed.error).to.include('size limit');
        expect(parsed.sizeKB).to.equal(512);
    });

    it('returns sliced content with header when offset and limit are provided', async () => {
        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'test.txt', offset: 1, limit: 2 }), undefined);

        expect(result).to.include('[Lines 2\u20133 of 5 total.');
        expect(result).to.include('line2\nline3');
    });

    it('returns sliced editor content with header when file is open and offset/limit are provided', async () => {
        mockMonacoWorkspace.getTextDocument = () => ({
            getText: () => 'alpha\nbeta\ngamma\ndelta\nepsilon'
        } as unknown as ReturnType<MonacoWorkspace['getTextDocument']>);

        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'open.txt', offset: 1, limit: 2 }), undefined);

        expect(result).to.include('[Lines 2\u20133 of 5 total.');
        expect(result).to.include('beta\ngamma');
    });

    it('does not call resolve() or read() for paginated disk reads, uses readStream instead', async () => {
        // Stat would report huge file, but the streaming path bypasses both stat and read
        let resolveCalled = false;
        let readCalled = false;
        mockResolve = async () => {
            resolveCalled = true;
            return {
                isFile: true,
                isDirectory: false,
                size: 512 * 1024,
                resource: new URI('file:///workspace/big.txt')
            };
        };
        mockRead = async () => {
            readCalled = true;
            return { value: 'should not be read' };
        };

        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'big.txt', offset: 0, limit: 3 }), undefined);

        // resolve and read are NOT called in the streaming path
        expect(resolveCalled).to.be.false;
        expect(readCalled).to.be.false;
        expect(result).to.include('line1\nline2\nline3');
    });

    it('rejects when the requested slice itself exceeds the size limit', async () => {
        const bigLine = 'x'.repeat(1024);
        const bigContent = Array.from({ length: 300 }, () => bigLine).join('\n');
        mockReadStream = async () => ({ value: makeMockStream(bigContent) });

        const handler = fileContentFunction.getTool().handler;
        // Reading all 300 lines × 1 KB each = ~300 KB, over the 256 KB default limit
        const result = await handler(JSON.stringify({ file: 'big.txt', offset: 0, limit: 300 }), undefined);

        const parsed = JSON.parse(result as string);
        expect(parsed.error).to.include('size limit');
        expect(parsed.resultSizeKB).to.be.greaterThan(256);
    });

    it('returns File not found error when file does not exist', async () => {
        mockResolve = async () => { throw new Error('File not found'); };
        mockRead = async () => { throw new Error('File not found'); };
        mockReadStream = async () => { throw new Error('File not found'); };

        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'nonexistent.txt' }), undefined);

        const parsed = JSON.parse(result as string);
        expect(parsed.error).to.equal('File not found');
    });

    it('rejects negative offset', async () => {
        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'test.txt', offset: -1 }), undefined);

        const parsed = JSON.parse(result as string);
        expect(parsed.error).to.include('non-negative integer');
    });

    it('rejects fractional offset', async () => {
        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'test.txt', offset: 1.5 }), undefined);

        const parsed = JSON.parse(result as string);
        expect(parsed.error).to.include('non-negative integer');
    });

    it('rejects negative limit', async () => {
        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'test.txt', limit: -1 }), undefined);

        const parsed = JSON.parse(result as string);
        expect(parsed.error).to.include('positive integer');
    });

    it('rejects zero limit', async () => {
        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'test.txt', limit: 0 }), undefined);

        const parsed = JSON.parse(result as string);
        expect(parsed.error).to.include('positive integer');
    });

    it('returns content from offset to end when only offset is provided', async () => {
        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'test.txt', offset: 2 }), undefined);

        expect(result).to.include('[Lines 3\u20135 of 5 total.');
        expect(result).to.include('line3\nline4\nline5');
    });

    it('returns last line when offset is at boundary', async () => {
        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'test.txt', offset: 4, limit: 1 }), undefined);

        expect(result).to.include('[Lines 5\u20135 of 5 total.');
        expect(result).to.include('line5');
    });

    it('returns empty content when offset is beyond end of file', async () => {
        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'test.txt', offset: 100, limit: 5 }), undefined);

        // slice beyond end returns empty array → empty joined string
        expect(result).to.include('[Lines 101\u2013100 of 5 total.');
    });

    it('uses custom preference value for size limit', async () => {
        // Set a very small limit of 1 KB
        mockPreferenceService.get = <T>(_path: string, _defaultValue: T) => 1 as unknown as T;

        const content = 'x'.repeat(2 * 1024); // 2 KB
        mockRead = async () => ({ value: content });
        mockResolve = async () => ({
            isFile: true,
            isDirectory: false,
            size: 2 * 1024,
            resource: new URI('file:///workspace/test.txt')
        });

        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'test.txt' }), undefined);

        const parsed = JSON.parse(result as string);
        expect(parsed.error).to.include('size limit');
        expect(parsed.maxSizeKB).to.equal(1);
    });

    it('falls back to streaming when stat.size is undefined and file is within limit', async () => {
        // stat does not include a size — the code must not treat this as "0 KB"
        // but instead stream the file and succeed when content is small.
        let readCalled = false;
        mockResolve = async () => ({
            isFile: true,
            isDirectory: false,
            size: undefined,
            resource: new URI('file:///workspace/test.txt')
        });
        mockRead = async () => {
            readCalled = true;
            return { value: 'should not be used' };
        };
        // mockReadStream already returns the small 5-line fixture from beforeEach

        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'test.txt' }), undefined);

        expect(readCalled).to.be.false;
        expect(result).to.include('line1');
        // Full-file streaming fallback must NOT include the [Lines...] header
        expect(result).to.not.include('[Lines');
    });

    it('returns size-limit error (not "File not found") when stat.size is undefined and streamed content exceeds limit', async () => {
        // stat does not include a size; the streamed content is larger than the limit.
        mockResolve = async () => ({
            isFile: true,
            isDirectory: false,
            size: undefined,
            resource: new URI('file:///workspace/big.txt')
        });
        const bigLine = 'x'.repeat(1024);
        const bigContent = Array.from({ length: 300 }, () => bigLine).join('\n'); // ~300 KB
        mockReadStream = async () => ({ value: makeMockStream(bigContent) });

        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'big.txt' }), undefined);

        const parsed = JSON.parse(result as string);
        expect(parsed.error).to.include('size limit');
        expect(parsed.error).to.include('offset');
        expect(parsed.error).not.to.equal('File not found');
    });

    it('returns size-limit error (not "File not found") when fileService.read throws FILE_TOO_LARGE', async () => {
        // Simulate a file system provider that enforces its own hard size limit below maxSizeKB.
        // stat.size is present and within our configured limit, but read() still throws.
        mockResolve = async () => ({
            isFile: true,
            isDirectory: false,
            size: 100 * 1024, // 100 KB — under the 256 KB default limit
            resource: new URI('file:///workspace/test.txt')
        });
        mockRead = async () => {
            throw new FileOperationError('File too large', FileOperationResult.FILE_TOO_LARGE);
        };

        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'test.txt' }), undefined);

        const parsed = JSON.parse(result as string);
        expect(parsed.error).to.include('size limit');
        expect(parsed.error).to.include('offset');
        expect(parsed.maxSizeKB).to.equal(256);
    });

    it('returns size-limit error (not "File not found") when fileService.read throws FILE_EXCEEDS_MEMORY_LIMIT', async () => {
        mockResolve = async () => ({
            isFile: true,
            isDirectory: false,
            size: 100 * 1024,
            resource: new URI('file:///workspace/test.txt')
        });
        mockRead = async () => {
            throw new FileOperationError('Exceeds memory limit', FileOperationResult.FILE_EXCEEDS_MEMORY_LIMIT);
        };

        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'test.txt' }), undefined);

        const parsed = JSON.parse(result as string);
        expect(parsed.error).to.include('size limit');
        expect(parsed.error).to.include('offset');
        expect(parsed.maxSizeKB).to.equal(256);
    });

    it('returns size-limit error (not "File not found") when readStream throws FILE_TOO_LARGE for paginated read', async () => {
        // This is the key scenario: files.maxFileSizeMB is lower than the file size,
        // but the caller is trying to read a chunk with offset/limit.
        // Before the fix, readStream would throw FILE_TOO_LARGE and the catch block
        // would return "File not found".
        mockReadStream = async () => {
            throw new FileOperationError('File too large', FileOperationResult.FILE_TOO_LARGE);
        };

        const handler = fileContentFunction.getTool().handler;
        const result = await handler(JSON.stringify({ file: 'big.txt', offset: 0, limit: 50 }), undefined);

        const parsed = JSON.parse(result as string);
        expect(parsed.error).to.include('size limit');
        expect(parsed.error).to.include('offset');
        expect(parsed.error).not.to.equal('File not found');
        expect(parsed.maxSizeKB).to.equal(256);
    });
});

describe('FindFilesByPattern.getArgumentsShortLabel', () => {
    let container: Container;
    let getArgumentsShortLabel: (args: string) => { label: string; hasMore: boolean } | undefined;

    let disableJSDOMInner: () => void;
    before(() => {
        disableJSDOMInner = enableJSDOM();
    });
    after(() => {
        disableJSDOMInner();
    });

    beforeEach(() => {
        container = new Container();

        const mockWorkspaceService = {
            roots: Promise.resolve([{ resource: new URI('file:///workspace') }]),
            tryGetRoots: () => [{ resource: new URI('file:///workspace') }],
            onWorkspaceChanged: () => ({ dispose: () => { } })
        } as unknown as WorkspaceService;

        const mockFileService = {
            exists: async () => true,
            resolve: async () => ({
                isDirectory: true,
                children: [],
                resource: new URI('file:///workspace')
            }),
            read: async () => ({ value: { toString: () => 'test content' } })
        } as unknown as FileService;

        const mockPreferenceService = {
            get: <T>(_path: string, defaultValue: T) => defaultValue
        };

        container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
        container.bind(FileService).toConstantValue(mockFileService);
        container.bind(PreferenceService).toConstantValue(mockPreferenceService);
        container.bind(WorkspaceFunctionScope).toSelf();
        container.bind(FindFilesByPattern).toSelf();

        const findFilesByPattern = container.get(FindFilesByPattern);
        const tool = findFilesByPattern.getTool();
        getArgumentsShortLabel = tool.getArgumentsShortLabel!;
    });

    it('returns label for valid pattern argument', () => {
        const result = getArgumentsShortLabel(JSON.stringify({ pattern: '**/*.ts' }));
        expect(result).to.deep.equal({ label: '**/*.ts', hasMore: false });
    });

    it('returns hasMore true when additional arguments exist', () => {
        const result = getArgumentsShortLabel(JSON.stringify({ pattern: '**/*.ts', exclude: ['node_modules'] }));
        expect(result).to.deep.equal({ label: '**/*.ts', hasMore: true });
    });

    it('returns undefined for invalid JSON', () => {
        const result = getArgumentsShortLabel('not valid json');
        expect(result).to.be.undefined;
    });

    it('returns undefined when pattern key is missing', () => {
        const result = getArgumentsShortLabel(JSON.stringify({ glob: '**/*.ts' }));
        expect(result).to.be.undefined;
    });
});

describe('WorkspaceFunctionScope Multi-Root Tests', () => {
    let container: Container;
    let workspaceScope: WorkspaceFunctionScope;

    let disableJSDOMInner: () => void;
    before(() => {
        disableJSDOMInner = enableJSDOM();
    });
    after(() => {
        disableJSDOMInner();
    });

    beforeEach(() => {
        container = new Container();
    });

    describe('getRootMapping', () => {
        it('returns single root with its basename', () => {
            const mockWorkspaceService = {
                tryGetRoots: () => [{ resource: new URI('file:///home/user/my-project') }],
                onWorkspaceChanged: () => ({ dispose: () => { } })
            } as unknown as WorkspaceService;

            container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
            container.bind(FileService).toConstantValue({} as FileService);
            container.bind(PreferenceService).toConstantValue({ get: () => false });
            container.bind(WorkspaceFunctionScope).toSelf();
            workspaceScope = container.get(WorkspaceFunctionScope);

            const mapping = workspaceScope.getRootMapping();
            expect(mapping.size).to.equal(1);
            expect(mapping.get('my-project')?.toString()).to.equal('file:///home/user/my-project');
        });

        it('returns multiple roots with their basenames', () => {
            const mockWorkspaceService = {
                tryGetRoots: () => [
                    { resource: new URI('file:///home/user/frontend') },
                    { resource: new URI('file:///home/user/backend') },
                    { resource: new URI('file:///home/user/shared') }
                ],
                onWorkspaceChanged: () => ({ dispose: () => { } })
            } as unknown as WorkspaceService;

            container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
            container.bind(FileService).toConstantValue({} as FileService);
            container.bind(PreferenceService).toConstantValue({ get: () => false });
            container.bind(WorkspaceFunctionScope).toSelf();
            workspaceScope = container.get(WorkspaceFunctionScope);

            const mapping = workspaceScope.getRootMapping();
            expect(mapping.size).to.equal(3);
            expect(mapping.get('frontend')?.toString()).to.equal('file:///home/user/frontend');
            expect(mapping.get('backend')?.toString()).to.equal('file:///home/user/backend');
            expect(mapping.get('shared')?.toString()).to.equal('file:///home/user/shared');
        });

        it('uses first-wins for duplicate basenames (sorted by URI)', () => {
            const mockWorkspaceService = {
                tryGetRoots: () => [
                    { resource: new URI('file:///alice/app') },
                    { resource: new URI('file:///bob/app') }
                ],
                onWorkspaceChanged: () => ({ dispose: () => { } })
            } as unknown as WorkspaceService;

            container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
            container.bind(FileService).toConstantValue({} as FileService);
            container.bind(PreferenceService).toConstantValue({ get: () => false });
            container.bind(WorkspaceFunctionScope).toSelf();
            workspaceScope = container.get(WorkspaceFunctionScope);

            const mapping = workspaceScope.getRootMapping();
            // Only one entry for 'app' — the first by URI sort order wins.
            // The other root is still reachable via resolveRelativePath fallback.
            expect(mapping.size).to.equal(1);
            expect(mapping.get('app')?.toString()).to.equal('file:///alice/app');
        });
    });

    describe('toWorkspaceRelativePath', () => {
        it('returns root-prefixed path for file in single root', () => {
            const mockWorkspaceService = {
                tryGetRoots: () => [{ resource: new URI('file:///home/user/project') }],
                onWorkspaceChanged: () => ({ dispose: () => { } })
            } as unknown as WorkspaceService;

            container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
            container.bind(FileService).toConstantValue({} as FileService);
            container.bind(PreferenceService).toConstantValue({ get: () => false });
            container.bind(WorkspaceFunctionScope).toSelf();
            workspaceScope = container.get(WorkspaceFunctionScope);

            const uri = new URI('file:///home/user/project/src/index.ts');
            const result = workspaceScope.toWorkspaceRelativePath(uri);
            expect(result).to.equal('project/src/index.ts');
        });

        it('returns root-prefixed path for file in multi-root workspace', () => {
            const mockWorkspaceService = {
                tryGetRoots: () => [
                    { resource: new URI('file:///home/user/frontend') },
                    { resource: new URI('file:///home/user/backend') }
                ],
                onWorkspaceChanged: () => ({ dispose: () => { } })
            } as unknown as WorkspaceService;

            container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
            container.bind(FileService).toConstantValue({} as FileService);
            container.bind(PreferenceService).toConstantValue({ get: () => false });
            container.bind(WorkspaceFunctionScope).toSelf();
            workspaceScope = container.get(WorkspaceFunctionScope);

            const frontendFile = new URI('file:///home/user/frontend/src/App.tsx');
            expect(workspaceScope.toWorkspaceRelativePath(frontendFile)).to.equal('frontend/src/App.tsx');

            const backendFile = new URI('file:///home/user/backend/src/server.ts');
            expect(workspaceScope.toWorkspaceRelativePath(backendFile)).to.equal('backend/src/server.ts');
        });

        it('returns undefined for file outside workspace', () => {
            const mockWorkspaceService = {
                tryGetRoots: () => [{ resource: new URI('file:///home/user/project') }],
                onWorkspaceChanged: () => ({ dispose: () => { } })
            } as unknown as WorkspaceService;

            container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
            container.bind(FileService).toConstantValue({} as FileService);
            container.bind(PreferenceService).toConstantValue({ get: () => false });
            container.bind(WorkspaceFunctionScope).toSelf();
            workspaceScope = container.get(WorkspaceFunctionScope);

            const uri = new URI('file:///etc/passwd');
            const result = workspaceScope.toWorkspaceRelativePath(uri);
            expect(result).to.be.undefined;
        });

        it('returns just root name for the root directory itself', () => {
            const mockWorkspaceService = {
                tryGetRoots: () => [{ resource: new URI('file:///home/user/project') }],
                onWorkspaceChanged: () => ({ dispose: () => { } })
            } as unknown as WorkspaceService;

            container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
            container.bind(FileService).toConstantValue({} as FileService);
            container.bind(PreferenceService).toConstantValue({ get: () => false });
            container.bind(WorkspaceFunctionScope).toSelf();
            workspaceScope = container.get(WorkspaceFunctionScope);

            const uri = new URI('file:///home/user/project');
            const result = workspaceScope.toWorkspaceRelativePath(uri);
            // When the URI is the root itself, it returns just the root name
            expect(result).to.equal('project');
        });
    });

    describe('resolveRelativePath', () => {
        function createScope(roots: string[]): WorkspaceFunctionScope {
            const rootObjects = roots.map(r => ({ resource: new URI(r) }));
            const mockWorkspaceService = {
                tryGetRoots: () => rootObjects,
                onWorkspaceChanged: () => ({ dispose: () => { } })
            } as unknown as WorkspaceService;
            container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
            container.bind(FileService).toConstantValue({} as FileService);
            container.bind(PreferenceService).toConstantValue({ get: () => false });
            container.bind(WorkspaceFunctionScope).toSelf();
            return container.get(WorkspaceFunctionScope);
        }

        describe('Phase 1 — root+relative', () => {
            it('resolves path with matching root prefix', () => {
                workspaceScope = createScope(['file:///home/user/frontend', 'file:///home/user/backend']);
                const result = workspaceScope.resolveRelativePath('backend/src/server.ts');
                expect(result.toString()).to.equal('file:///home/user/backend/src/server.ts');
            });

            it('returns the root URI when path is just a root name', () => {
                workspaceScope = createScope(['file:///home/user/frontend', 'file:///home/user/backend']);
                const result = workspaceScope.resolveRelativePath('frontend');
                expect(result.toString()).to.equal('file:///home/user/frontend');
            });

            it('root name takes priority over subdirectory with same name', () => {
                // Root named 'src' exists, AND another root has a 'src/' subdirectory
                workspaceScope = createScope(['file:///home/user/src', 'file:///home/user/app']);
                const result = workspaceScope.resolveRelativePath('src/index.ts');
                expect(result.toString()).to.equal('file:///home/user/src/index.ts');
            });
        });

        describe('Phase 2 — supra-relative', () => {
            it('resolves when root basename appears with matching preceding components', () => {
                workspaceScope = createScope(['file:///home/user/backend']);
                // 'user/backend/src/file.ts' — 'backend' matches root basename, 'user' matches preceding component
                const result = workspaceScope.resolveRelativePath('user/backend/src/file.ts');
                expect(result.toString()).to.equal('file:///home/user/backend/src/file.ts');
            });

            it('resolves with full preceding path match', () => {
                workspaceScope = createScope(['file:///home/user/backend']);
                const result = workspaceScope.resolveRelativePath('home/user/backend/src/file.ts');
                expect(result.toString()).to.equal('file:///home/user/backend/src/file.ts');
            });

            it('does not match when preceding components differ', () => {
                // Must use multi-root so Phase 3 (single-root fallback) doesn't short-circuit
                workspaceScope = createScope(['file:///home/user/frontend', 'file:///home/user/backend']);
                // 'other/backend/src/file.ts' — 'other' does NOT match any suffix of 'home/user'
                expect(() => workspaceScope.resolveRelativePath('other/backend/src/file.ts')).to.throw(/Could not resolve path/);
            });

            it('resolves with no preceding components (just root basename at start)', () => {
                // This should be caught by Phase 1 (root+relative) since the first segment IS the root name
                workspaceScope = createScope(['file:///home/user/backend']);
                const result = workspaceScope.resolveRelativePath('backend/src/file.ts');
                expect(result.toString()).to.equal('file:///home/user/backend/src/file.ts');
            });

            it('resolves supra-relative path in multi-root workspace', () => {
                workspaceScope = createScope(['file:///home/user/frontend', 'file:///home/user/backend']);
                const result = workspaceScope.resolveRelativePath('user/backend/src/file.ts');
                expect(result.toString()).to.equal('file:///home/user/backend/src/file.ts');
            });
        });

        describe('Phase 3 — single-root fallback', () => {
            it('resolves unprefixed path relative to the single root', () => {
                workspaceScope = createScope(['file:///home/user/project']);
                const result = workspaceScope.resolveRelativePath('src/index.ts');
                expect(result.toString()).to.equal('file:///home/user/project/src/index.ts');
            });

            it('resolves new file path relative to single root', () => {
                workspaceScope = createScope(['file:///home/user/project']);
                const result = workspaceScope.resolveRelativePath('new-file.ts');
                expect(result.toString()).to.equal('file:///home/user/project/new-file.ts');
            });
        });

        describe('Phase 4 — error for unresolvable multi-root paths', () => {
            it('throws when unprefixed path cannot be resolved in multi-root', () => {
                workspaceScope = createScope(['file:///home/user/frontend', 'file:///home/user/backend']);
                expect(() => workspaceScope.resolveRelativePath('src/index.ts')).to.throw(/Could not resolve path/);
            });

            it('error message lists available roots', () => {
                workspaceScope = createScope(['file:///home/user/frontend', 'file:///home/user/backend']);
                try {
                    workspaceScope.resolveRelativePath('src/index.ts');
                    expect.fail('Expected an error');
                } catch (e: unknown) {
                    const error = e as Error;
                    expect(error.message).to.include('frontend');
                    expect(error.message).to.include('backend');
                }
            });

            it('does not throw when root prefix is provided in multi-root', () => {
                workspaceScope = createScope(['file:///home/user/frontend', 'file:///home/user/backend']);
                const result = workspaceScope.resolveRelativePath('frontend/src/index.ts');
                expect(result.toString()).to.equal('file:///home/user/frontend/src/index.ts');
            });
        });

        describe('normalization', () => {
            it('normalizes backslash paths', () => {
                workspaceScope = createScope(['file:///home/user/project']);
                const result = workspaceScope.resolveRelativePath('project\\src\\index.ts');
                expect(result.toString()).to.equal('file:///home/user/project/src/index.ts');
            });

            it('resolves .. segments', () => {
                workspaceScope = createScope(['file:///home/user/project']);
                const result = workspaceScope.resolveRelativePath('project/src/../src/index.ts');
                expect(result.toString()).to.equal('file:///home/user/project/src/index.ts');
            });

            it('normalizes redundant separators', () => {
                workspaceScope = createScope(['file:///home/user/project']);
                const result = workspaceScope.resolveRelativePath('project/src//index.ts');
                expect(result.path.toString()).to.include('project/src/index.ts');
            });

            it('handles trailing slashes', () => {
                workspaceScope = createScope(['file:///home/user/project']);
                const result = workspaceScope.resolveRelativePath('project/src/');
                expect(result.path.toString()).to.include('project/src');
            });
        });

        describe('duplicate root basenames', () => {
            it('round-trips the mapped root correctly', () => {
                workspaceScope = createScope(['file:///workspace/a/app', 'file:///workspace/b/app']);
                const mapping = workspaceScope.getRootMapping();
                expect(mapping.size).to.equal(1);
                expect(mapping.get('app')?.toString()).to.equal('file:///workspace/a/app');

                // Round-trip for the mapped root
                const uri = mapping.get('app')!.resolve('src/index.ts');
                const relPath = workspaceScope.toWorkspaceRelativePath(uri)!;
                expect(relPath).to.equal('app/src/index.ts');
                const resolved = workspaceScope.resolveRelativePath(relPath);
                expect(resolved.toString()).to.equal(uri.toString());
            });

            it('unmapped root returns undefined from toWorkspaceRelativePath', () => {
                workspaceScope = createScope(['file:///workspace/a/app', 'file:///workspace/b/app']);
                const uri = new URI('file:///workspace/b/app').resolve('src/unique.ts');
                const relPath = workspaceScope.toWorkspaceRelativePath(uri);
                expect(relPath).to.be.undefined;
            });

            it('resolves app/path to the mapped root (Phase 1)', () => {
                // Phase 1 always resolves to the mapped root by name
                workspaceScope = createScope(['file:///workspace/a/app', 'file:///workspace/b/app']);
                const result = workspaceScope.resolveRelativePath('app/src/only-here.ts');
                // Always goes to the mapped root (a/app)
                expect(result.toString()).to.equal('file:///workspace/a/app/src/only-here.ts');
            });
        });
    });

    describe('getRootMapping duplicate basename stability', () => {
        it('assigns the same root to a name regardless of tryGetRoots order', () => {
            // First ordering
            const mockWorkspaceServiceA = {
                tryGetRoots: () => [
                    { resource: new URI('file:///workspace/b/app') },
                    { resource: new URI('file:///workspace/a/app') }
                ],
                onWorkspaceChanged: () => ({ dispose: () => { } })
            } as unknown as WorkspaceService;

            container.bind(WorkspaceService).toConstantValue(mockWorkspaceServiceA);
            container.bind(FileService).toConstantValue({} as FileService);
            container.bind(PreferenceService).toConstantValue({ get: () => false });
            container.bind(WorkspaceFunctionScope).toSelf();
            const scopeA = container.get(WorkspaceFunctionScope);
            const mappingA = scopeA.getRootMapping();

            // Reverse ordering in a fresh container
            const container2 = new Container();
            const mockWorkspaceServiceB = {
                tryGetRoots: () => [
                    { resource: new URI('file:///workspace/a/app') },
                    { resource: new URI('file:///workspace/b/app') }
                ],
                onWorkspaceChanged: () => ({ dispose: () => { } })
            } as unknown as WorkspaceService;

            container2.bind(WorkspaceService).toConstantValue(mockWorkspaceServiceB);
            container2.bind(FileService).toConstantValue({} as FileService);
            container2.bind(PreferenceService).toConstantValue({ get: () => false });
            container2.bind(WorkspaceFunctionScope).toSelf();
            const scopeB = container2.get(WorkspaceFunctionScope);
            const mappingB = scopeB.getRootMapping();

            // Both orderings should produce the same winner for 'app'
            // (first by URI sort order: file:///workspace/a/app)
            expect(mappingA.size).to.equal(1);
            expect(mappingB.size).to.equal(1);
            expect(mappingA.get('app')?.toString()).to.equal(mappingB.get('app')?.toString());
            expect(mappingA.get('app')?.toString()).to.equal('file:///workspace/a/app');
        });
    });

    describe('getContainingRoot', () => {
        it('returns the most specific root for nested roots', () => {
            const mockWorkspaceService = {
                tryGetRoots: () => [
                    { resource: new URI('file:///projects/monorepo') },
                    { resource: new URI('file:///projects/monorepo/packages/shared') }
                ],
                onWorkspaceChanged: () => ({ dispose: () => { } })
            } as unknown as WorkspaceService;

            container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
            container.bind(FileService).toConstantValue({} as FileService);
            container.bind(PreferenceService).toConstantValue({ get: () => false });
            container.bind(WorkspaceFunctionScope).toSelf();
            workspaceScope = container.get(WorkspaceFunctionScope);

            // File in nested root should resolve to the more specific root
            const fileInNested = new URI('file:///projects/monorepo/packages/shared/src/utils.ts');
            const result = workspaceScope.getContainingRoot(fileInNested);
            expect(result?.toString()).to.equal('file:///projects/monorepo/packages/shared');

            // File in parent root (outside nested) should resolve to parent
            const fileInParent = new URI('file:///projects/monorepo/src/main.ts');
            const resultParent = workspaceScope.getContainingRoot(fileInParent);
            expect(resultParent?.toString()).to.equal('file:///projects/monorepo');
        });

        it('returns undefined for file outside all workspace roots', () => {
            const mockWorkspaceService = {
                tryGetRoots: () => [
                    { resource: new URI('file:///home/user/project') }
                ],
                onWorkspaceChanged: () => ({ dispose: () => { } })
            } as unknown as WorkspaceService;

            container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
            container.bind(FileService).toConstantValue({} as FileService);
            container.bind(PreferenceService).toConstantValue({ get: () => false });
            container.bind(WorkspaceFunctionScope).toSelf();
            workspaceScope = container.get(WorkspaceFunctionScope);

            const externalFile = new URI('file:///tmp/outside.ts');
            const result = workspaceScope.getContainingRoot(externalFile);
            expect(result).to.be.undefined;
        });
    });

    describe('round-trip consistency', () => {
        it('toWorkspaceRelativePath and resolveRelativePath are inverses', () => {
            const mockWorkspaceService = {
                tryGetRoots: () => [
                    { resource: new URI('file:///home/user/frontend') },
                    { resource: new URI('file:///home/user/backend') }
                ],
                onWorkspaceChanged: () => ({ dispose: () => { } })
            } as unknown as WorkspaceService;

            container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
            container.bind(FileService).toConstantValue({} as FileService);
            container.bind(PreferenceService).toConstantValue({ get: () => false });
            container.bind(WorkspaceFunctionScope).toSelf();
            workspaceScope = container.get(WorkspaceFunctionScope);

            const originalUri = new URI('file:///home/user/backend/src/index.ts');
            const relativePath = workspaceScope.toWorkspaceRelativePath(originalUri)!;
            const resolvedUri = workspaceScope.resolveRelativePath(relativePath);

            expect(resolvedUri.toString()).to.equal(originalUri.toString());
        });

        it('paths from toWorkspaceRelativePath always have a root prefix that resolves directly', () => {
            const mockWorkspaceService = {
                tryGetRoots: () => [
                    { resource: new URI('file:///home/user/frontend') },
                    { resource: new URI('file:///home/user/backend') }
                ],
                onWorkspaceChanged: () => ({ dispose: () => { } })
            } as unknown as WorkspaceService;

            container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
            container.bind(FileService).toConstantValue({} as FileService);
            container.bind(PreferenceService).toConstantValue({ get: () => false });
            container.bind(WorkspaceFunctionScope).toSelf();
            workspaceScope = container.get(WorkspaceFunctionScope);

            // Test for each root
            const roots = workspaceScope.getRootMapping();
            for (const [rootName, rootUri] of roots) {
                const fileUri = rootUri.resolve('src/app.ts');
                const relPath = workspaceScope.toWorkspaceRelativePath(fileUri)!;
                expect(relPath.startsWith(rootName + '/')).to.be.true;
                const resolved = workspaceScope.resolveRelativePath(relPath);
                expect(resolved.toString()).to.equal(fileUri.toString());
            }
        });
    });
});
