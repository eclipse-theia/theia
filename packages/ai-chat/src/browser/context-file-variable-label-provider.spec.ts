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
try {
    FrontendApplicationConfigProvider.set({});
} catch {
}

import { expect } from 'chai';
import { Emitter, Event, URI, bindContributionProvider } from '@theia/core';
import { ApplicationShell, LabelProvider, LabelProviderContribution, WidgetManager } from '@theia/core/lib/browser';
import { Container } from '@theia/core/shared/inversify';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { MockEnvVariablesServerImpl } from '@theia/core/lib/browser/test/mock-env-variables-server';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangeType, FileChangesEvent, FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { WorkspaceUriLabelProviderContribution } from '@theia/workspace/lib/browser/workspace-uri-contribution';
import { WorkspaceVariableContribution } from '@theia/workspace/lib/browser/workspace-variable-contribution';
import { AIVariableResolutionRequest } from '@theia/ai-core';
import { WorkspaceRelativePathResolver } from '@theia/ai-core/lib/browser';
import { ContextFileVariableLabelProvider } from './context-file-variable-label-provider.js';
import { ChangeSetFileService } from './change-set-file-service.js';

disableJSDOM();

describe('ContextFileVariableLabelProvider', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    describe('canHandle', () => {
        let provider: ContextFileVariableLabelProvider;

        beforeEach(() => {
            const container = new Container();
            container.bind(LabelProvider).toConstantValue({} as LabelProvider);
            container.bind(WorkspaceService).toConstantValue({} as WorkspaceService);
            container.bind(ChangeSetFileService).toConstantValue({} as ChangeSetFileService);
            container.bind(ContextFileVariableLabelProvider).toSelf();
            provider = container.get(ContextFileVariableLabelProvider);
        });

        it('returns 10 for file variable resolution request', () => {
            const request: AIVariableResolutionRequest = {
                variable: { id: 'file-provider', name: 'file', description: 'File' },
                arg: 'src/browser/test.ts'
            };
            expect(provider.canHandle(request)).to.equal(10);
        });

        it('returns -1 for non-file variable resolution request', () => {
            const request: AIVariableResolutionRequest = {
                variable: { id: 'workspace-provider', name: 'workspace', description: 'Workspace' },
                arg: 'something'
            };
            expect(provider.canHandle(request)).to.equal(-1);
        });

        it('returns -1 for non-request objects', () => {
            expect(provider.canHandle({})).to.equal(-1);
            expect(provider.canHandle(new URI('file:///test.ts'))).to.equal(-1);
        });
    });

    describe('direct URI and absolute path parsing', () => {
        let provider: ContextFileVariableLabelProvider;
        let capturedUri: URI | undefined;

        const setupProvider = (): void => {
            capturedUri = undefined;
            const container = new Container();
            const mockLabelProvider = {
                getIcon: (uri: URI) => { capturedUri = uri; return 'icon-class'; },
                getName: (uri: URI) => { capturedUri = uri; return uri.path.base; },
                getLongName: (uri: URI) => { capturedUri = uri; return uri.path.toString(); },
                getDetails: (uri: URI) => { capturedUri = uri; return uri.parent.path.toString(); }
            } as unknown as LabelProvider;

            container.bind(LabelProvider).toConstantValue(mockLabelProvider);
            container.bind(WorkspaceService).toConstantValue({} as WorkspaceService);
            container.bind(ChangeSetFileService).toConstantValue({} as ChangeSetFileService);
            container.bind(ContextFileVariableLabelProvider).toSelf();
            provider = container.get(ContextFileVariableLabelProvider);
        };

        const uriTestCases = [
            {
                description: 'preserves file:/ URI with single slash',
                arg: 'file:/ws/theia/src/test.ts',
                expected: 'file:///ws/theia/src/test.ts'
            },
            {
                description: 'preserves file:/// URI with triple slashes',
                arg: 'file:///ws/theia/src/test.ts',
                expected: 'file:///ws/theia/src/test.ts'
            },
            {
                description: 'preserves user-storage:/ URI',
                arg: 'user-storage:/settings.json',
                expected: 'user-storage:/settings.json'
            },
            {
                description: 'preserves custom URI schemes like vscode-vfs:/',
                arg: 'vscode-vfs:/remote/folder/file.ts',
                expected: 'vscode-vfs:/remote/folder/file.ts'
            },
            {
                description: 'handles Windows drive paths with forward slashes without treating drive as scheme',
                arg: 'C:/ws/theia/src/test.ts',
                expected: 'file:///c%3A/ws/theia/src/test.ts'
            },
            {
                description: 'handles Windows drive paths with backslashes without treating drive as scheme',
                arg: 'C:\\ws\\theia\\src\\test.ts',
                expected: 'file:///c%3A/ws/theia/src/test.ts'
            },
            {
                description: 'handles absolute POSIX path',
                arg: '/ws/theia/src/test.ts',
                expected: 'file:///ws/theia/src/test.ts'
            }
        ];

        for (const { description, arg, expected } of uriTestCases) {
            it(description, () => {
                setupProvider();
                const request: AIVariableResolutionRequest = {
                    variable: { id: 'file', name: 'file', description: 'File' },
                    arg
                };
                provider.getDetails(request);
                expect(capturedUri?.toString()).to.equal(expected);
            });
        }

        it('returns undefined when arg is undefined or empty', () => {
            setupProvider();
            const emptyRequest: AIVariableResolutionRequest = {
                variable: { id: 'file', name: 'file', description: 'File' },
                arg: ''
            };
            expect(provider.getName(emptyRequest)).to.be.undefined;
            expect(provider.getDetails(emptyRequest)).to.be.undefined;
            expect(provider.getLongName(emptyRequest)).to.be.undefined;
            expect(provider.getIcon(emptyRequest)).to.be.undefined;
        });
    });

    describe('fallback-path helper and Path.hasDir handling', () => {
        let provider: ContextFileVariableLabelProvider;

        beforeEach(() => {
            const container = new Container();
            container.bind(LabelProvider).toConstantValue({
                getIcon: () => 'default-file-icon',
                getName: (uri: URI) => uri.path.base,
                getLongName: (uri: URI) => uri.path.toString(),
                getDetails: (uri: URI) => uri.parent.path.toString()
            } as unknown as LabelProvider);
            container.bind(WorkspaceService).toConstantValue({} as WorkspaceService);
            container.bind(ChangeSetFileService).toConstantValue({} as ChangeSetFileService);
            container.bind(ContextFileVariableLabelProvider).toSelf();
            provider = container.get(ContextFileVariableLabelProvider);
        });

        it('preserves empty details for root-level files', () => {
            const request: AIVariableResolutionRequest = {
                variable: { id: 'file', name: 'file', description: 'File' },
                arg: 'package.json'
            };
            expect(provider.getName(request)).to.equal('package.json');
            expect(provider.getDetails(request)).to.equal('');
            expect(provider.getLongName(request)).to.equal('package.json');
        });

        it('returns normalized parent details for nested relative path', () => {
            const request: AIVariableResolutionRequest = {
                variable: { id: 'file', name: 'file', description: 'File' },
                arg: 'src/service.ts'
            };
            expect(provider.getName(request)).to.equal('service.ts');
            expect(provider.getDetails(request)).to.equal('src');
            expect(provider.getLongName(request)).to.equal('src/service.ts');
        });

        it('returns normalized parent details for deeply nested relative path', () => {
            const request: AIVariableResolutionRequest = {
                variable: { id: 'file', name: 'file', description: 'File' },
                arg: 'a/b/c.ts'
            };
            expect(provider.getName(request)).to.equal('c.ts');
            expect(provider.getDetails(request)).to.equal('a/b');
            expect(provider.getLongName(request)).to.equal('a/b/c.ts');
        });
    });

    describe('relative-path root selection and cache lifecycle', () => {
        let provider: ContextFileVariableLabelProvider;
        let fileChangesEmitter: Emitter<FileChangesEvent>;
        let workspaceChangeEmitter: Emitter<FileStat[]>;
        let resolverFunction: (arg: string) => Promise<URI | undefined>;

        beforeEach(() => {
            fileChangesEmitter = new Emitter<FileChangesEvent>();
            workspaceChangeEmitter = new Emitter<FileStat[]>();
            resolverFunction = async () => undefined;

            const container = new Container();
            const mockLabelProvider = {
                getIcon: (uri: URI) => `icon:${uri.path.base}`,
                getName: (uri: URI) => uri.path.base,
                getLongName: (uri: URI) => uri.path.toString(),
                getDetails: (uri: URI) => {
                    // Simulates root prefix based on URI parent path
                    if (uri.path.toString().startsWith('/ws/backend/')) {
                        return 'backend • ' + uri.parent.path.toString().replace('/ws/backend/', '').replace(/^\//, '');
                    }
                    if (uri.path.toString().startsWith('/ws/frontend/')) {
                        return 'frontend • ' + uri.parent.path.toString().replace('/ws/frontend/', '').replace(/^\//, '');
                    }
                    return uri.parent.path.toString().replace(/^\//, '');
                }
            } as unknown as LabelProvider;

            const mockFileService = {
                onDidFilesChange: fileChangesEmitter.event
            } as unknown as FileService;

            const mockWorkspaceService = {
                onWorkspaceChanged: workspaceChangeEmitter.event,
                onWorkspaceLocationChanged: Event.None,
                tryGetRoots: () => [
                    { resource: new URI('file:///ws/frontend'), isDirectory: true },
                    { resource: new URI('file:///ws/backend'), isDirectory: true }
                ]
            } as unknown as WorkspaceService;

            const mockPathResolver = {
                resolveExistingRelativePath: async (arg: string) => resolverFunction(arg)
            } as unknown as WorkspaceRelativePathResolver;

            container.bind(LabelProvider).toConstantValue(mockLabelProvider);
            container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
            container.bind(FileService).toConstantValue(mockFileService);
            container.bind(ChangeSetFileService).toConstantValue({} as ChangeSetFileService);
            container.bind(WorkspaceRelativePathResolver).toConstantValue(mockPathResolver);
            container.bind(ContextFileVariableLabelProvider).toSelf();
            provider = container.get(ContextFileVariableLabelProvider);
            provider.init();
        });

        afterEach(() => {
            provider.dispose();
            fileChangesEmitter.dispose();
            workspaceChangeEmitter.dispose();
        });

        it('uses neutral pending label until async result is ready and refreshes UI', async () => {
            resolverFunction = async (arg: string) => {
                if (arg === 'src/service.ts') {
                    return new URI('file:///ws/backend/src/service.ts');
                }
                return undefined;
            };

            const request: AIVariableResolutionRequest = {
                variable: { id: 'file', name: 'file', description: 'File' },
                arg: 'src/service.ts'
            };

            // Initial synchronous call should return a neutral pending label without root prefix
            expect(provider.getName(request)).to.equal('service.ts');
            expect(provider.getDetails(request)).to.equal('src');
            expect(provider.getLongName(request)).to.equal('src/service.ts');

            // Wait for async resolution to fire onDidChange
            const onDidChange = Event.toPromise(provider.onDidChange);
            await onDidChange;

            // Once resolved, label reflects the authority root (backend, not frontend fallback)
            expect(provider.getName(request)).to.equal('service.ts');
            expect(provider.getDetails(request)).to.equal('backend • src');
        });

        it('invalidates pending lookup when file is created during in-flight lookup (deferred promise test)', async () => {
            const deferredFirstLookup = new Deferred<URI | undefined>();
            resolverFunction = async (arg: string) => {
                if (arg === 'src/generated.ts') {
                    return deferredFirstLookup.promise;
                }
                return undefined;
            };

            const request: AIVariableResolutionRequest = {
                variable: { id: 'file', name: 'file', description: 'File' },
                arg: 'src/generated.ts'
            };

            // Initial call triggers lookup which is pending
            expect(provider.getDetails(request)).to.equal('src');

            // While the first lookup is still pending, the missing file is created
            // Switch resolver function to return the created file for new lookups
            resolverFunction = async (arg: string) => {
                if (arg === 'src/generated.ts') {
                    return new URI('file:///ws/backend/src/generated.ts');
                }
                return undefined;
            };

            // Fire file creation event
            fileChangesEmitter.fire(new FileChangesEvent([
                { resource: new URI('file:///ws/backend/src/generated.ts'), type: FileChangeType.ADDED }
            ]));

            // Now resolve the first lookup with undefined (pre-creation miss)
            deferredFirstLookup.resolve(undefined);
            await new Promise(resolve => setTimeout(resolve, 0));

            // Re-query label on demand (as UI does when notified of changes)
            const onResolved = Event.toPromise(provider.onDidChange);
            provider.getDetails(request);
            await onResolved;

            // Must resolve to the newly created backend file, not blocked by the outdated pre-creation miss
            expect(provider.getDetails(request)).to.equal('backend • src');
        });

        it('discards stale completion when older lookup finishes after newer lookup (reverse completion order test)', async () => {
            const deferredBackendLookup = new Deferred<URI | undefined>();

            // Initial state: older lookup is delayed
            resolverFunction = async (arg: string) => {
                if (arg === 'src/service.ts') {
                    return deferredBackendLookup.promise;
                }
                return undefined;
            };

            const request: AIVariableResolutionRequest = {
                variable: { id: 'file', name: 'file', description: 'File' },
                arg: 'src/service.ts'
            };

            // Start older lookup (representing delayed backend result)
            provider.getDetails(request);

            // File moves to frontend: fire event and point resolver to frontend
            resolverFunction = async (arg: string) => {
                if (arg === 'src/service.ts') {
                    return new URI('file:///ws/frontend/src/service.ts');
                }
                return undefined;
            };

            fileChangesEmitter.fire(new FileChangesEvent([
                { resource: new URI('file:///ws/frontend/src/service.ts'), type: FileChangeType.ADDED },
                { resource: new URI('file:///ws/backend/src/service.ts'), type: FileChangeType.DELETED }
            ]));

            // Start newer lookup (representing frontend result) and wait for it to complete FIRST
            const onFrontendResolved = Event.toPromise(provider.onDidChange);
            provider.getDetails(request);
            await onFrontendResolved;
            expect(provider.getDetails(request)).to.equal('frontend • src');

            // Now older backend lookup completes LAST
            deferredBackendLookup.resolve(new URI('file:///ws/backend/src/service.ts'));
            await new Promise(resolve => setTimeout(resolve, 10));

            // Stale completion must not overwrite the newer frontend URI
            expect(provider.getDetails(request)).to.equal('frontend • src');
        });

        it('invalidates and re-resolves when workspace roots change', async () => {
            resolverFunction = async (arg: string) => {
                if (arg === 'src/service.ts') {
                    return new URI('file:///ws/backend/src/service.ts');
                }
                return undefined;
            };

            const request: AIVariableResolutionRequest = {
                variable: { id: 'file', name: 'file', description: 'File' },
                arg: 'src/service.ts'
            };

            const onDidChange = Event.toPromise(provider.onDidChange);
            provider.getDetails(request);
            await onDidChange;
            expect(provider.getDetails(request)).to.equal('backend • src');

            // Roots change and file now resolves to frontend
            resolverFunction = async (arg: string) => {
                if (arg === 'src/service.ts') {
                    return new URI('file:///ws/frontend/src/service.ts');
                }
                return undefined;
            };

            const onInvalidated = Event.toPromise(provider.onDidChange);
            workspaceChangeEmitter.fire([
                FileStat.dir('file:///ws/frontend')
            ]);
            await onInvalidated;

            // On-demand query after root change
            const onResolved = Event.toPromise(provider.onDidChange);
            provider.getDetails(request);
            await onResolved;

            expect(provider.getDetails(request)).to.equal('frontend • src');
        });
    });

    describe('integration with LabelProvider and WorkspaceUriLabelProviderContribution', () => {
        let container: Container;
        let labelProvider: LabelProvider;
        let roots: FileStat[];
        let fileExists: (uri: URI) => boolean = () => false;

        beforeEach(() => {
            roots = [FileStat.dir('file:///ws/theia')];
            fileExists = () => false;
            container = new Container();

            container.bind(ApplicationShell).toConstantValue({
                onDidChangeCurrentWidget: () => undefined,
                widgets: []
            } as unknown as ApplicationShell);
            container.bind(WidgetManager).toConstantValue({
                onDidCreateWidget: Event.None
            } as unknown as WidgetManager);

            const workspaceService = new WorkspaceService();
            workspaceService.tryGetRoots = () => roots;
            (workspaceService as unknown as { _roots: FileStat[] })._roots = roots;
            container.bind(WorkspaceService).toConstantValue(workspaceService);
            container.bind(WorkspaceVariableContribution).toSelf().inSingletonScope();
            container.bind(FileService).toConstantValue({
                exists: async (uri: URI) => fileExists(uri),
                onDidFilesChange: Event.None
            } as unknown as FileService);
            container.bind(WorkspaceRelativePathResolver).toSelf().inSingletonScope();
            container.bind(EnvVariablesServer).toConstantValue(new MockEnvVariablesServerImpl(new URI('file:///tmp')));
            container.bind(ChangeSetFileService).toConstantValue({} as ChangeSetFileService);

            bindContributionProvider(container, LabelProviderContribution);
            container.bind(LabelProvider).toSelf().inSingletonScope();

            container.bind(WorkspaceUriLabelProviderContribution).toSelf().inSingletonScope();
            container.bind(LabelProviderContribution).toService(WorkspaceUriLabelProviderContribution);

            container.bind(ContextFileVariableLabelProvider).toSelf().inSingletonScope();
            container.bind(LabelProviderContribution).toService(ContextFileVariableLabelProvider);

            const wsUriContrib = container.get(WorkspaceUriLabelProviderContribution);
            wsUriContrib.init();

            labelProvider = container.get(LabelProvider);
            labelProvider.initialize();
        });

        it('formats details without leading slash for relative paths (#15343)', async () => {
            fileExists = (uri: URI) => uri.toString() === 'file:///ws/theia/examples/api-samples/src/browser/chat/change-set-chat-agent-contribution.ts';
            const request: AIVariableResolutionRequest = {
                variable: { id: 'file', name: 'file', description: 'File' },
                arg: 'examples/api-samples/src/browser/chat/change-set-chat-agent-contribution.ts'
            };

            const details = labelProvider.getDetails(request);
            expect(details).to.equal('examples/api-samples/src/browser/chat');
            expect(details).to.not.match(/^\//);

            const name = labelProvider.getName(request);
            expect(name).to.equal('change-set-chat-agent-contribution.ts');

            const longName = labelProvider.getLongName(request);
            expect(longName).to.equal('examples/api-samples/src/browser/chat/change-set-chat-agent-contribution.ts');
        });

        it('formats details for root-level file without leading slash (#15343)', () => {
            const request: AIVariableResolutionRequest = {
                variable: { id: 'file', name: 'file', description: 'File' },
                arg: 'package.json'
            };

            const details = labelProvider.getDetails(request);
            expect(details).to.equal('');

            const name = labelProvider.getName(request);
            expect(name).to.equal('package.json');
        });

        it('formats details for root-prefixed path in multi-root workspace', async () => {
            roots = [FileStat.dir('file:///ws/other'), FileStat.dir('file:///ws/theia')];
            fileExists = (uri: URI) => uri.toString() === 'file:///ws/theia/examples/api-samples/test.ts';
            const wsUriContrib = container.get(WorkspaceUriLabelProviderContribution);
            wsUriContrib.init();

            const request: AIVariableResolutionRequest = {
                variable: { id: 'file', name: 'file', description: 'File' },
                arg: 'theia/examples/api-samples/test.ts'
            };

            const onDidChange = Event.toPromise(labelProvider.onDidChange);
            const initialDetails = labelProvider.getDetails(request);
            // Neutral pending details
            expect(initialDetails).to.equal('theia/examples/api-samples');
            await onDidChange;

            // Resolved details with root prefix
            const details = labelProvider.getDetails(request);
            expect(details).to.equal('theia • examples/api-samples');

            const name = labelProvider.getName(request);
            expect(name).to.equal('test.ts');
        });

        it('resolves relative path to the root containing the file in multi-root workspace', async () => {
            roots = [FileStat.dir('file:///ws/frontend'), FileStat.dir('file:///ws/backend')];
            fileExists = (uri: URI) => uri.toString() === 'file:///ws/backend/src/service.ts';
            const wsUriContrib = container.get(WorkspaceUriLabelProviderContribution);
            wsUriContrib.init();

            const request: AIVariableResolutionRequest = {
                variable: { id: 'file', name: 'file', description: 'File' },
                arg: 'src/service.ts'
            };

            const onDidChange = Event.toPromise(labelProvider.onDidChange);
            const initialDetails = labelProvider.getDetails(request);
            expect(initialDetails).to.equal('src'); // Neutral pending details without wrong frontend root
            await onDidChange;

            expect(labelProvider.getDetails(request)).to.equal('backend • src');
            expect(labelProvider.getName(request)).to.equal('service.ts');
        });
    });
});
