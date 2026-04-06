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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { Emitter, URI } from '@theia/core';
import { ConfigurableInMemoryResources } from '@theia/ai-core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangesEvent, FileChangeType } from '@theia/filesystem/lib/common/files';
import { EditorPreferences } from '@theia/editor/lib/common/editor-preferences';
import { FileSystemPreferences } from '@theia/filesystem/lib/common';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { MonacoCodeActionService } from '@theia/monaco/lib/browser';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { ChangeSetFileElement, ChangeSetElementArgs } from './change-set-file-element';
import { ChangeSetFileService } from './change-set-file-service';

disableJSDOM();

describe('ChangeSetFileElement', () => {
    let sandbox: sinon.SinonSandbox;
    let container: Container;
    let element: ChangeSetFileElement;
    let fileChangeEmitter: Emitter<FileChangesEvent>;
    let mockChangeSetFileService: sinon.SinonStubbedInstance<ChangeSetFileService>;
    let inMemoryResources: ConfigurableInMemoryResources;

    const testUri = new URI('file:///test/file.ts');
    const chatSessionId = 'test-session';
    const originalContent = 'original content';
    const targetContent = 'target content';

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        fileChangeEmitter = new Emitter<FileChangesEvent>();

        mockChangeSetFileService = sandbox.createStubInstance(ChangeSetFileService);
        mockChangeSetFileService.read.resolves(originalContent);
        mockChangeSetFileService.getName.returns('file.ts');
        mockChangeSetFileService.getIcon.returns(undefined);
        mockChangeSetFileService.getAdditionalInfo.returns(undefined);

        inMemoryResources = new ConfigurableInMemoryResources();

        container = new Container();

        container.bind(ChangeSetElementArgs).toConstantValue({
            uri: testUri,
            chatSessionId,
            requestId: 'test-request',
            targetState: targetContent,
        });

        container.bind(ChangeSetFileService).toConstantValue(mockChangeSetFileService as unknown as ChangeSetFileService);

        container.bind(FileService).toConstantValue({
            onDidFilesChange: fileChangeEmitter.event,
        } as unknown as FileService);

        container.bind(ConfigurableInMemoryResources).toConstantValue(inMemoryResources);

        container.bind(MonacoTextModelService).toConstantValue({} as unknown as MonacoTextModelService);
        container.bind(EditorPreferences).toConstantValue({} as unknown as EditorPreferences);
        container.bind(FileSystemPreferences).toConstantValue({} as unknown as FileSystemPreferences);
        container.bind(MonacoCodeActionService).toConstantValue({} as unknown as MonacoCodeActionService);
        container.bind(MonacoWorkspace).toConstantValue({} as unknown as MonacoWorkspace);

        container.bind(ChangeSetFileElement).toSelf();
        element = container.get(ChangeSetFileElement);
    });

    afterEach(() => {
        element.dispose();
        fileChangeEmitter.dispose();
        sandbox.restore();
    });

    function fireFileChange(): void {
        const event = new FileChangesEvent([{
            resource: testUri,
            type: FileChangeType.UPDATED,
        }]);
        fileChangeEmitter.fire(event);
    }

    describe('listenForOriginalFileChanges', () => {
        it('should not update readOnlyResource contents on file change', async () => {
            await element.ensureInitialized();

            // Access readOnlyUri to ensure the resource is created
            const readOnlyUri = element.readOnlyUri;
            const readOnlyResource = inMemoryResources.resolve(readOnlyUri);
            expect(await readOnlyResource.readContents()).to.equal(originalContent);

            // Simulate the file on disk being changed to the target content (as if apply happened externally)
            mockChangeSetFileService.read.resolves(targetContent);
            fireFileChange();

            // Allow the async event handler to run
            await new Promise(resolve => setTimeout(resolve, 10));

            // The readOnlyResource should still contain the original content
            expect(await readOnlyResource.readContents()).to.equal(originalContent);
        });

        it('should set state to "applied" when file content matches targetState', async () => {
            await element.ensureInitialized();

            mockChangeSetFileService.read.resolves(targetContent);
            fireFileChange();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(element.state).to.equal('applied');
        });

        it('should set state to "pending" when file content matches original content', async () => {
            await element.ensureInitialized();

            mockChangeSetFileService.read.resolves(originalContent);
            fireFileChange();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(element.state).to.equal('pending');
        });

        it('should set state to "stale" when file content differs from both original and target', async () => {
            await element.ensureInitialized();

            mockChangeSetFileService.read.resolves('some other content');
            fireFileChange();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(element.state).to.equal('stale');
        });

        it('should ignore file change events for unrelated URIs', async () => {
            await element.ensureInitialized();

            mockChangeSetFileService.read.resolves('some other content');

            const unrelatedEvent = new FileChangesEvent([{
                resource: new URI('file:///other/file.ts'),
                type: FileChangeType.UPDATED,
            }]);
            fileChangeEmitter.fire(unrelatedEvent);

            await new Promise(resolve => setTimeout(resolve, 10));

            // State should remain undefined (no change from initial)
            expect(element.state).to.be.undefined;
        });

        it('should update changeResource when file changes post-apply', async () => {
            await element.ensureInitialized();

            // Access changedUri to ensure the _changeResource is created
            const changedUri = element.changedUri;

            // Move to 'applied' state
            (element as unknown as { _state: string })._state = 'applied';

            // Simulate file changing to content that differs from both original and target
            mockChangeSetFileService.read.resolves('externally modified content');

            const changeFired = new Promise<void>(resolve => element.onDidChange(resolve));
            fireFileChange();

            await changeFired;

            // The _changeResource should have been updated with the new content
            const changeResource = inMemoryResources.resolve(changedUri);
            expect(await changeResource.readContents()).to.equal('externally modified content');
        });

        it('should handle delete type correctly when read returns undefined', async () => {
            element.dispose();
            container.rebind(ChangeSetElementArgs).toConstantValue({
                uri: testUri,
                chatSessionId,
                requestId: 'test-request',
                targetState: '',
                type: 'delete',
            });
            element = container.get(ChangeSetFileElement);
            await element.ensureInitialized();

            // Simulate read returning undefined (file was deleted)
            mockChangeSetFileService.read.resolves(undefined as unknown as string);
            fireFileChange();

            await new Promise(resolve => setTimeout(resolve, 10));

            // targetState is '' and (undefined ?? '') === '', so state should be 'applied'
            expect(element.state).to.equal('applied');
        });

        it('should skip file change handling when originalState is provided', async () => {
            // Recreate with originalState set
            element.dispose();
            container.rebind(ChangeSetElementArgs).toConstantValue({
                uri: testUri,
                chatSessionId,
                requestId: 'test-request',
                targetState: targetContent,
                originalState: 'fixed original',
            });
            element = container.get(ChangeSetFileElement);
            await element.ensureInitialized();

            mockChangeSetFileService.read.resolves('changed content');
            fireFileChange();

            await new Promise(resolve => setTimeout(resolve, 10));

            // State should remain unchanged since the listener was not registered
            expect(element.state).to.be.undefined;
        });
    });

    describe('_isApplying guard', () => {
        it('should ignore file change events while applying', async () => {
            await element.ensureInitialized();

            // Access the _isApplying flag via cast to set it for testing
            (element as unknown as { _isApplying: boolean })._isApplying = true;

            mockChangeSetFileService.read.resolves(targetContent);
            fireFileChange();

            await new Promise(resolve => setTimeout(resolve, 10));

            // State should remain unchanged since the listener was skipped
            expect(element.state).to.be.undefined;

            // Verify read was not called for the file change handler
            // (only the initial read during initialization should have been called)
            expect(mockChangeSetFileService.read.callCount).to.equal(1);

            (element as unknown as { _isApplying: boolean })._isApplying = false;
        });

        it('should resume handling file changes after applying completes', async () => {
            await element.ensureInitialized();

            // Simulate apply starting
            (element as unknown as { _isApplying: boolean })._isApplying = true;

            mockChangeSetFileService.read.resolves(targetContent);
            fireFileChange();
            await new Promise(resolve => setTimeout(resolve, 10));

            // Should be ignored
            expect(element.state).to.be.undefined;

            // Simulate apply completing
            (element as unknown as { _isApplying: boolean })._isApplying = false;

            // Now fire another file change - this one should be handled
            fireFileChange();
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(element.state).to.equal('applied');
        });
    });

    describe('initialization', () => {
        it('should load original content from file service during init', async () => {
            await element.ensureInitialized();

            expect(await element.getOriginalContent()).to.equal(originalContent);
        });

        it('should use originalState from props when provided', async () => {
            element.dispose();
            container.rebind(ChangeSetElementArgs).toConstantValue({
                uri: testUri,
                chatSessionId,
                requestId: 'test-request',
                targetState: targetContent,
                originalState: 'explicit original',
            });
            element = container.get(ChangeSetFileElement);
            await element.ensureInitialized();

            expect(await element.getOriginalContent()).to.equal('explicit original');
            // Reset call count tracking and verify that the new element did not call read
            // (the initial element from beforeEach may have called read, so we check
            // that no additional read was called after the stub was reset)
            expect(mockChangeSetFileService.read.callCount).to.equal(1);
        });
    });
});
