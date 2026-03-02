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
            roots: [{ resource: new URI('file:///workspace') }]
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
        const result = await handler(JSON.stringify({ path: '' }), mockCtx);

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
            roots: [{ resource: new URI('file:///workspace') }]
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
            roots: [{ resource: new URI('file:///workspace') }]
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
