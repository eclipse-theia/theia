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
import { URI, bindContributionProvider } from '@theia/core';
import { ApplicationShell, LabelProvider, LabelProviderContribution, WidgetManager } from '@theia/core/lib/browser';
import { Container } from '@theia/core/shared/inversify';
import { Event } from '@theia/core/lib/common/event';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { MockEnvVariablesServerImpl } from '@theia/core/lib/browser/test/mock-env-variables-server';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { WorkspaceUriLabelProviderContribution } from '@theia/workspace/lib/browser/workspace-uri-contribution';
import { WorkspaceVariableContribution } from '@theia/workspace/lib/browser/workspace-variable-contribution';
import { AIVariableResolutionRequest } from '@theia/ai-core';
import { ContextFileVariableLabelProvider } from './context-file-variable-label-provider';
import { ChangeSetFileService } from './change-set-file-service';

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

    describe('URI resolution against workspace', () => {
        let provider: ContextFileVariableLabelProvider;
        let capturedUri: URI | undefined;

        const setupProvider = (roots: string[]): void => {
            capturedUri = undefined;
            const container = new Container();
            const mockLabelProvider = {
                getIcon: (uri: URI) => { capturedUri = uri; return 'icon-class'; },
                getName: (uri: URI) => { capturedUri = uri; return uri.path.base; },
                getLongName: (uri: URI) => { capturedUri = uri; return uri.path.toString(); },
                getDetails: (uri: URI) => { capturedUri = uri; return uri.parent.path.toString(); }
            } as unknown as LabelProvider;

            const workspaceService = Object.assign(Object.create(WorkspaceService.prototype) as WorkspaceService, {
                tryGetRoots: () => roots.map(root => ({ resource: new URI(root), isDirectory: true }))
            });

            container.bind(LabelProvider).toConstantValue(mockLabelProvider);
            container.bind(WorkspaceService).toConstantValue(workspaceService);
            container.bind(ChangeSetFileService).toConstantValue({} as ChangeSetFileService);
            container.bind(ContextFileVariableLabelProvider).toSelf();
            provider = container.get(ContextFileVariableLabelProvider);
        };

        it('resolves relative path to workspace URI in single-root workspace', () => {
            setupProvider(['file:///ws/theia']);
            const request: AIVariableResolutionRequest = {
                variable: { id: 'file', name: 'file', description: 'File' },
                arg: 'examples/api-samples/src/browser/chat/change-set-chat-agent-contribution.ts'
            };
            provider.getDetails(request);
            expect(capturedUri?.toString()).to.equal(
                'file:///ws/theia/examples/api-samples/src/browser/chat/change-set-chat-agent-contribution.ts'
            );
        });

        it('resolves root-prefixed path in multi-root workspace', () => {
            setupProvider(['file:///ws/other', 'file:///ws/theia']);
            const request: AIVariableResolutionRequest = {
                variable: { id: 'file', name: 'file', description: 'File' },
                arg: 'theia/examples/api-samples/src/browser/test.ts'
            };
            provider.getDetails(request);
            expect(capturedUri?.toString()).to.equal('file:///ws/theia/examples/api-samples/src/browser/test.ts');
        });

        it('handles URI strings without modification', () => {
            setupProvider(['file:///ws/theia']);
            const request: AIVariableResolutionRequest = {
                variable: { id: 'file', name: 'file', description: 'File' },
                arg: 'file:///ws/theia/examples/test.ts'
            };
            provider.getDetails(request);
            expect(capturedUri?.toString()).to.equal('file:///ws/theia/examples/test.ts');
        });

        it('returns undefined when arg is undefined or empty', () => {
            setupProvider(['file:///ws/theia']);
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

    describe('integration with LabelProvider and WorkspaceUriLabelProviderContribution', () => {
        let container: Container;
        let labelProvider: LabelProvider;
        let roots: FileStat[];

        beforeEach(() => {
            roots = [FileStat.dir('file:///ws/theia')];
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
            container.bind(FileService).toConstantValue({} as FileService);
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
        });

        it('formats details without leading slash for relative paths (#15343)', () => {
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

        it('formats details for root-prefixed path in multi-root workspace', () => {
            roots = [FileStat.dir('file:///ws/other'), FileStat.dir('file:///ws/theia')];
            const wsUriContrib = container.get(WorkspaceUriLabelProviderContribution);
            wsUriContrib.init();

            const request: AIVariableResolutionRequest = {
                variable: { id: 'file', name: 'file', description: 'File' },
                arg: 'theia/examples/api-samples/test.ts'
            };

            const details = labelProvider.getDetails(request);
            expect(details).to.equal('theia • examples/api-samples');

            const name = labelProvider.getName(request);
            expect(name).to.equal('test.ts');
        });
    });
});
