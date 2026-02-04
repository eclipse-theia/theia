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

import {
    AbstractStreamParsingChatAgent,
    ChatAgent,
    MutableChatRequestModel,
    MarkdownChatResponseContentImpl,
    SystemMessageDescription
} from '@theia/ai-chat';
import { ChangeSetFileElementFactory } from '@theia/ai-chat/lib/browser/change-set-file-element';
import { Agent, LanguageModelRequirement } from '@theia/ai-core';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { wait } from '@theia/core/lib/common/promise-util';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';

export function bindOriginalStateTestAgentContribution(bind: interfaces.Bind): void {
    bind(OriginalStateTestAgent).toSelf().inSingletonScope();
    bind(Agent).toService(OriginalStateTestAgent);
    bind(ChatAgent).toService(OriginalStateTestAgent);
}

/**
 * This is a test agent demonstrating how to test originalState functionality in change sets.
 * It creates change set elements with original content provided and tests sequential updates.
 */
@injectable()
export class OriginalStateTestAgent extends AbstractStreamParsingChatAgent {
    readonly id = 'OriginalStateTestSample';
    readonly name = 'OriginalStateTestSample';
    readonly defaultLanguageModelPurpose = 'chat';
    override readonly description = 'This chat will test originalState functionality with sequential changes.';
    override languageModelRequirements: LanguageModelRequirement[] = [];

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(ChangeSetFileElementFactory)
    protected readonly fileChangeFactory: ChangeSetFileElementFactory;

    override async invoke(request: MutableChatRequestModel): Promise<void> {
        const roots = this.workspaceService.tryGetRoots();
        if (roots.length === 0) {
            request.response.response.addContent(new MarkdownChatResponseContentImpl(
                'No workspace is open. For using this test agent, please open a workspace with at least one file.'
            ));
            request.response.complete();
            return;
        }

        const root = roots[0];
        const files = root.children?.filter(child => child.isFile);
        if (!files || files.length === 0) {
            request.response.response.addContent(new MarkdownChatResponseContentImpl(
                'The workspace does not contain any files. For using this test agent, please add at least one file in the root.'
            ));
            request.response.complete();
            return;
        }

        const chatSessionId = request.session.id;
        const requestId = request.id;

        request.response.response.addContent(new MarkdownChatResponseContentImpl(
            'Testing originalState functionality...\n\n' +
            'Three sequential changes to an existing file with 1000ms delays between each.'
        ));

        await wait(1000);
        request.session.changeSet.setTitle('Original State Test Changes');

        // Select an existing file for sequential modifications
        const existingFile = files[Math.floor(Math.random() * files.length)];
        const existingFileUri = existingFile.resource;

        // Read the current content to use as originalState
        const currentContent = await this.fileService.read(existingFileUri);
        const originalState = currentContent.value.toString();

        // First modification with originalState provided
        request.response.response.addContent(new MarkdownChatResponseContentImpl('\n\nCreate modification 1'));
        const modifiedContent1 = await this.computeModifiedState(originalState, 1);
        await this.fileService.write(existingFileUri, modifiedContent1);
        const firstModification = this.fileChangeFactory({
            uri: existingFileUri,
            type: 'modify',
            state: 'applied',
            originalState,
            targetState: modifiedContent1,
            requestId,
            chatSessionId
        });

        request.session.changeSet.addElements(firstModification);
        await wait(1000);

        // Second modification with originalState from previous change
        request.response.response.addContent(new MarkdownChatResponseContentImpl('\n\nCreate modification 2'));
        const modifiedContent2 = await this.computeModifiedState(modifiedContent1, 2);
        await this.fileService.write(existingFileUri, modifiedContent2);
        const secondModification = this.fileChangeFactory({
            uri: existingFileUri,
            type: 'modify',
            state: 'applied',
            originalState,
            targetState: modifiedContent2,
            requestId,
            chatSessionId
        });

        request.session.changeSet.addElements(secondModification);
        await wait(1000);

        // Third modification with originalState from previous change
        request.response.response.addContent(new MarkdownChatResponseContentImpl('\n\nCreate modification 3'));
        const modifiedContent3 = await this.computeModifiedState(modifiedContent2, 3);
        await this.fileService.write(existingFileUri, modifiedContent3);
        const thirdModification = this.fileChangeFactory({
            uri: existingFileUri,
            type: 'modify',
            state: 'applied',
            originalState,
            targetState: modifiedContent3,
            requestId,
            chatSessionId
        });

        request.session.changeSet.addElements(thirdModification);

        request.response.response.addContent(new MarkdownChatResponseContentImpl('\n\nTest completed!'));
        request.response.complete();
    }

    async computeModifiedState(content: string, changeNumber: number): Promise<string> {
        const changeComment = `// Modified by Original State Test Agent - Change ${changeNumber}\n`;
        return changeComment + content + `\n// This line was added by change ${changeNumber} at ${new Date().toISOString()}`;
    }

    protected override async getSystemMessageDescription(): Promise<SystemMessageDescription | undefined> {
        return undefined;
    }
}
