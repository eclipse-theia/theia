// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
    SystemMessageDescription,
    ChangeSetElement
} from '@theia/ai-chat';
import { ChangeSetFileElementFactory } from '@theia/ai-chat/lib/browser/change-set-file-element';
import { Agent, LanguageModelRequirement } from '@theia/ai-core';
import { URI } from '@theia/core';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';

export function bindChangeSetChatAgentContribution(bind: interfaces.Bind): void {
    bind(ChangeSetChatAgent).toSelf().inSingletonScope();
    bind(Agent).toService(ChangeSetChatAgent);
    bind(ChatAgent).toService(ChangeSetChatAgent);
}

/**
 * This is a test agent demonstrating how to create change sets in AI chats.
 */
@injectable()
export class ChangeSetChatAgent extends AbstractStreamParsingChatAgent {
    readonly id = 'ChangeSetSample';
    readonly name = 'ChangeSetSample';
    readonly defaultLanguageModelPurpose = 'chat';
    override readonly description = 'This chat will create and modify a change set.';
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
                'No workspace is open. For using this chat agent, please open a workspace with at least two files in the root.'
            ));
            request.response.complete();
            return;
        }

        const root = roots[0];
        const files = root.children?.filter(child => child.isFile);
        if (!files || files.length < 3) {
            request.response.response.addContent(new MarkdownChatResponseContentImpl(
                'The workspace does not contain any files. For using this chat agent, please add at least two files in the root.'
            ));
            request.response.complete();
            return;
        }

        const fileToAdd = root.resource.resolve('hello/new-file.txt');
        const fileToChange = files[Math.floor(Math.random() * files.length)];
        const fileToDelete = files.filter(file => file.name !== fileToChange.name)[Math.floor(Math.random() * files.length)];

        const changes: ChangeSetElement[] = [];
        const chatSessionId = request.session.id;
        const requestId = request.id;

        changes.push(
            this.fileChangeFactory({
                uri: fileToAdd,
                type: 'add',
                state: 'pending',
                targetState: 'Hello World!',
                requestId,
                chatSessionId
            })
        );

        if (fileToChange && fileToChange.resource) {
            changes.push(
                this.fileChangeFactory({
                    uri: fileToChange.resource,
                    type: 'modify',
                    state: 'pending',
                    targetState: await this.computeTargetState(fileToChange.resource),
                    requestId,
                    chatSessionId
                })
            );
        }
        if (fileToDelete && fileToDelete.resource) {
            changes.push(
                this.fileChangeFactory({
                    uri: fileToDelete.resource,
                    type: 'delete',
                    state: 'pending',
                    requestId,
                    chatSessionId
                })
            );
        }
        request.session.changeSet.setTitle('My Test Change Set');
        request.session.changeSet.setElements(...changes);

        request.response.response.addContent(new MarkdownChatResponseContentImpl(
            'I have created a change set for you. You can now review and apply it.'
        ));
        request.response.complete();
    }
    async computeTargetState(resource: URI): Promise<string> {
        const content = await this.fileService.read(resource);
        if (content.value.length < 20) {
            return 'HelloWorldModify';
        }
        let readLocation = Math.random() * 0.1 * content.value.length;
        let oldLocation = 0;
        let output = '';
        while (readLocation < content.value.length) {
            output += content.value.substring(oldLocation, readLocation);
            oldLocation = readLocation;
            const type = Math.random();
            if (type < 0.33) {
                // insert
                output += `this is an insert at ${readLocation}`;
            } else {
                // delete
                oldLocation += 20;
            }

            readLocation += Math.random() * 0.1 * content.value.length;
        }
        return output;
    }

    protected override async getSystemMessageDescription(): Promise<SystemMessageDescription | undefined> {
        return undefined;
    }
}
