// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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
const disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});
import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { Disposable, ILogger, PreferenceService, URI } from '@theia/core';
import { OpenerService } from '@theia/core/lib/browser';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { AIVariableResourceResolver } from '@theia/ai-core';
import { InMemoryTaskContextStorage } from '@theia/ai-chat/lib/browser/task-context-storage-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { TaskContextFileStorageService } from './task-context-file-storage-service';
disableJSDOM();

const workspaceRoot = new URI('file:///workspace');
const storageLocation = workspaceRoot.resolve('.prompts/task-contexts');

describe('TaskContextFileStorageService', () => {

    let files: Map<string, string>;
    let service: TaskContextFileStorageService;

    beforeEach(() => {
        files = new Map();
        const container = new Container();
        container.bind(FileService).toConstantValue({
            watch: () => Disposable.NULL,
            onDidFilesChange: () => Disposable.NULL,
            resolve: async () => ({ children: [] }),
            read: async (uri: URI) => {
                const value = files.get(uri.toString());
                if (value === undefined) {
                    throw new Error(`No file at ${uri}`);
                }
                return { value };
            },
            writeFile: async (uri: URI, content: BinaryBuffer) => {
                files.set(uri.toString(), content.toString());
            }
        } as unknown as FileService);
        container.bind(WorkspaceService).toConstantValue({
            opened: true,
            ready: Promise.resolve(),
            tryGetRoots: () => [{ resource: workspaceRoot }]
        } as unknown as WorkspaceService);
        container.bind(PreferenceService).toConstantValue({
            ready: Promise.resolve(),
            inspect: () => ({ defaultValue: '.prompts/task-contexts' }),
            onPreferenceChanged: () => Disposable.NULL
        } as unknown as PreferenceService);
        container.bind(ILogger).toConstantValue({ error: () => { } } as unknown as ILogger);
        container.bind(OpenerService).toConstantValue({} as OpenerService);
        container.bind(AIVariableResourceResolver).toConstantValue({} as AIVariableResourceResolver);
        container.bind(InMemoryTaskContextStorage).toSelf().inSingletonScope();
        container.bind(TaskContextFileStorageService).toSelf().inSingletonScope();
        service = container.get(TaskContextFileStorageService);
    });

    const readFile = (uri: URI): Promise<void> => (service as unknown as { readFile(uri: URI): Promise<void> }).readFile(uri);

    it('writes the metadata as standard frontmatter', async () => {
        await service.store({ id: 'task-1', sessionId: 'session-1', label: 'Fix the build', summary: '# Plan\n\nDo it.' });

        const content = files.get(storageLocation.resolve('Fix-the-build.md').toString());
        expect(content).to.not.be.undefined;
        const lines = content!.split('\n');
        expect(lines[0]).to.equal('---');
        expect(lines).to.include.members(['id: task-1', 'sessionId: session-1', 'label: Fix the build']);
        expect(content).to.match(/\n---\n# Plan\n\nDo it\.$/);
    });

    it('reads back the body without the frontmatter', async () => {
        await service.store({ id: 'task-1', label: 'Fix the build', summary: '# Plan\n\nDo it.' });

        const summary = await service.get('task-1');
        expect(summary?.summary).to.equal('# Plan\n\nDo it.');
        expect(summary?.label).to.equal('Fix the build');
    });

    it('still reads files written without the opening separator', async () => {
        const uri = storageLocation.resolve('legacy.md');
        files.set(uri.toString(), 'id: legacy-task\nlabel: Legacy task\n---\n# Legacy plan');

        await readFile(uri);

        const summary = await service.get('legacy-task');
        expect(summary?.label).to.equal('Legacy task');
        expect(summary?.summary).to.equal('# Legacy plan');
    });
});
