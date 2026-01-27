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
import { FileChatVariableContribution } from './file-chat-variable-contribution';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ILogger, URI } from '@theia/core';
import { ApplicationShell } from '@theia/core/lib/browser';

class TestContribution extends FileChatVariableContribution {
    public override async fileToBase64(uri: URI): Promise<string> {
        return super.fileToBase64(uri);
    }

    public override getMimeTypeFromExtension(filePath: string): string {
        return super.getMimeTypeFromExtension(filePath);
    }

    public override isImageFile(filePath: string): boolean {
        return super.isImageFile(filePath);
    }

    public override registerVariables(): void {
        // no-op
    }
}

disableJSDOM();

describe('FileChatVariableContribution', () => {
    let sandbox: sinon.SinonSandbox;

    let fileService: sinon.SinonStubbedInstance<FileService>;
    let wsService: sinon.SinonStubbedInstance<WorkspaceService>;
    let logger: sinon.SinonStubbedInstance<ILogger>;

    let contribution: TestContribution;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        sandbox = sinon.createSandbox();

        fileService = {
            readFile: sandbox.stub(),
            exists: sandbox.stub(),
        } as unknown as sinon.SinonStubbedInstance<FileService>;

        wsService = {
            getWorkspaceRelativePath: sandbox.stub(),
        } as unknown as sinon.SinonStubbedInstance<WorkspaceService>;

        logger = {
            error: sandbox.stub(),
        } as unknown as sinon.SinonStubbedInstance<ILogger>;

        contribution = new TestContribution();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (contribution as any).fileService = fileService;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (contribution as any).wsService = wsService;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (contribution as any).logger = logger;
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should return empty base64 string and log error when reading fails', async () => {
        const uri = new URI('file:///test.png');
        fileService.readFile.rejects(new Error('read failed'));

        const result = await contribution.fileToBase64(uri);

        expect(result).to.equal('');
        expect(logger.error.called).to.be.true;
    });

    it('should not create image request on drop when base64 conversion fails', async () => {
        const imageUri = new URI('file:///test.png');

        sandbox.stub(ApplicationShell, 'getDraggedEditorUris').returns([imageUri]);
        fileService.exists.resolves(true);
        wsService.getWorkspaceRelativePath.resolves('test.png');

        sandbox.stub(contribution, 'isImageFile').returns(true);
        sandbox.stub(contribution, 'fileToBase64').resolves('');

        const event = {
            dataTransfer: {},
        } as unknown as DragEvent;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (contribution as any).handleDrop(event, {} as any);

        expect(result).to.deep.equal({ variables: [], text: undefined });
    });
});
