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

import { MutableChatRequestModel } from '@theia/ai-chat';
import { ChangeSetFileElement, ChangeSetFileElementFactory } from '@theia/ai-chat/lib/browser/change-set-file-element';
import { ChangeSetElement } from '@theia/ai-chat/lib/common/change-set';
import { ContentReplacer, Replacement } from '@theia/core/lib/common/content-replacer';
import { URI } from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileEditBackupService } from './claude-code-file-edit-backup-service';

export interface EditToolInput {
    file_path: string;
    old_string: string;
    new_string: string;
}

export interface MultiEditToolInput {
    file_path: string;
    edits: Array<{
        old_string: string;
        new_string: string;
    }>;
}

export interface WriteToolInput {
    file_path: string;
    content: string;
}

export interface ToolUseBlock {
    name: string;
    input: EditToolInput | MultiEditToolInput | WriteToolInput;
}

export interface EditToolContext {
    sessionId: string | undefined;
    isEditMode: boolean;
}

export const ClaudeCodeEditToolService = Symbol('ClaudeCodeEditToolService');

/**
 * Service for handling edit tool operations.
 *
 * Invoked by the ClaudeCodeChatAgent on each finished edit tool request.
 * This can be used to track and manage file edits made by the agent, e.g.
 * to propagate them to ChangeSets (see ClaudeCodeEditToolServiceImpl below).
 */
export interface ClaudeCodeEditToolService {
    handleEditTool(toolUse: ToolUseBlock, request: MutableChatRequestModel, context: EditToolContext): Promise<void>;
}

/**
 * Propagates edit tool results to change sets in the specified request's session.
 */
@injectable()
export class ClaudeCodeEditToolServiceImpl implements ClaudeCodeEditToolService {

    @inject(ChangeSetFileElementFactory)
    protected readonly fileChangeFactory: ChangeSetFileElementFactory;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileEditBackupService)
    protected readonly backupService: FileEditBackupService;

    private readonly contentReplacer = new ContentReplacer();

    async handleEditTool(toolUse: ToolUseBlock, request: MutableChatRequestModel, context: EditToolContext): Promise<void> {
        try {
            const { name, input } = toolUse;

            switch (name) {
                case 'Edit':
                    await this.handleEditSingle(input as EditToolInput, request, context);
                    break;
                case 'MultiEdit':
                    await this.handleEditMultiple(input as MultiEditToolInput, request, context);
                    break;
                case 'Write':
                    await this.handleWriteFile(input as WriteToolInput, request, context);
                    break;
            }
        } catch (error) {
            console.error('Error handling edit tool:', error);
        }
    }

    protected async handleEditSingle(input: EditToolInput, request: MutableChatRequestModel, context: EditToolContext): Promise<void> {
        try {
            const workspaceUri = await this.toWorkspaceUri(input.file_path);
            const currentContent = await this.fileService.read(workspaceUri);
            const currentContentString = currentContent.value.toString();
            const existingChangeSetElement = request.session.changeSet.getElementByURI(workspaceUri);

            const replacement: Replacement = {
                oldContent: input.old_string,
                newContent: input.new_string
            };

            if (context.isEditMode) {
                await this.handleEditModeCommon(
                    workspaceUri,
                    currentContentString,
                    [replacement],
                    existingChangeSetElement,
                    request,
                    context
                );
            } else {
                await this.handleNonEditModeCommon(
                    workspaceUri,
                    currentContentString,
                    [replacement],
                    existingChangeSetElement,
                    request
                );
            }

            request.session.changeSet.setTitle('Changes by Claude Code');
        } catch (error) {
            console.error('Error handling Edit tool:', error);
        }
    }

    protected async handleEditMultiple(input: MultiEditToolInput, request: MutableChatRequestModel, context: EditToolContext): Promise<void> {
        try {
            const workspaceUri = await this.toWorkspaceUri(input.file_path);
            const currentContent = await this.fileService.read(workspaceUri);
            const currentContentString = currentContent.value.toString();
            const existingChangeSetElement = request.session.changeSet.getElementByURI(workspaceUri);

            const replacements: Replacement[] = input.edits.map(edit => ({
                oldContent: edit.old_string,
                newContent: edit.new_string
            }));

            if (context.isEditMode) {
                await this.handleEditModeCommon(
                    workspaceUri,
                    currentContentString,
                    replacements,
                    existingChangeSetElement,
                    request,
                    context
                );
            } else {
                await this.handleNonEditModeCommon(
                    workspaceUri,
                    currentContentString,
                    replacements,
                    existingChangeSetElement,
                    request
                );
            }

            request.session.changeSet.setTitle('Changes by Claude Code');
        } catch (error) {
            console.error('Error handling MultiEdit tool:', error);
        }
    }

    protected async handleWriteFile(input: WriteToolInput, request: MutableChatRequestModel, context: EditToolContext): Promise<void> {
        try {
            const workspaceUri = await this.toWorkspaceUri(input.file_path);
            const fileExists = await this.fileService.exists(workspaceUri);

            if (context.isEditMode) {
                if (input.content === '') {
                    const originalState = await this.backupService.getOriginal(workspaceUri, context.sessionId);
                    const fileElement = this.fileChangeFactory({
                        uri: workspaceUri,
                        type: 'delete',
                        state: 'applied',
                        originalState,
                        targetState: '',
                        requestId: request.id,
                        chatSessionId: request.session.id
                    });

                    request.session.changeSet.addElements(fileElement);
                } else {
                    const type = !fileExists ? 'add' : 'modify';
                    let originalState = '';
                    if (type === 'modify') {
                        originalState = (await this.backupService.getOriginal(workspaceUri, context.sessionId)) ?? '';
                    }

                    const fileElement = this.fileChangeFactory({
                        uri: workspaceUri,
                        type,
                        state: 'applied',
                        originalState,
                        targetState: input.content,
                        requestId: request.id,
                        chatSessionId: request.session.id
                    });

                    request.session.changeSet.addElements(fileElement);
                }
            } else {
                const type = input.content === '' ? 'delete' :
                    !fileExists ? 'add' : 'modify';

                const fileElement = this.fileChangeFactory({
                    uri: workspaceUri,
                    type,
                    state: 'pending',
                    targetState: input.content,
                    requestId: request.id,
                    chatSessionId: request.session.id
                });

                request.session.changeSet.addElements(fileElement);
            }

            request.session.changeSet.setTitle('Changes by Claude Code');
        } catch (error) {
            console.error('Error handling Write tool:', error);
        }
    }

    protected async handleEditModeCommon(
        workspaceUri: URI,
        currentContentString: string,
        replacements: Replacement[],
        existingChangeSetElement: ChangeSetElement | undefined,
        request: MutableChatRequestModel,
        context: EditToolContext
    ): Promise<void> {
        const originalState = await this.backupService.getOriginal(workspaceUri, context.sessionId);
        const existingReplacements = (existingChangeSetElement instanceof ChangeSetFileElement) && existingChangeSetElement.replacements || [];

        const fileElement = this.fileChangeFactory({
            uri: workspaceUri,
            type: 'modify',
            state: 'applied',
            originalState,
            targetState: currentContentString,
            requestId: request.id,
            chatSessionId: request.session.id,
            replacements: [...existingReplacements, ...replacements]
        });

        request.session.changeSet.addElements(fileElement);
    }

    protected async handleNonEditModeCommon(
        workspaceUri: URI,
        currentContentString: string,
        replacements: Replacement[],
        existingChangeSetElement: ChangeSetElement | undefined,
        request: MutableChatRequestModel
    ): Promise<void> {
        const { updatedContent, errors } = this.contentReplacer.applyReplacements(
            currentContentString,
            replacements
        );

        if (errors.length > 0) {
            console.error('Content replacement errors:', errors);
            return;
        }

        if (updatedContent !== currentContentString) {
            const existingReplacements = (existingChangeSetElement instanceof ChangeSetFileElement) && existingChangeSetElement.replacements || [];

            const fileElement = this.fileChangeFactory({
                uri: workspaceUri,
                type: 'modify',
                state: 'pending',
                targetState: updatedContent,
                requestId: request.id,
                chatSessionId: request.session.id,
                replacements: [...existingReplacements, ...replacements]
            });

            request.session.changeSet.addElements(fileElement);
        }
    }

    protected async toWorkspaceUri(absolutePath: string): Promise<URI> {
        const absoluteUri = new URI(absolutePath);
        const workspaceUri = this.workspaceService.getWorkspaceRootUri(absoluteUri);
        if (!workspaceUri) {
            throw new Error(`No workspace found for ${absolutePath}`);
        }

        const relativeUri = await this.workspaceService.getWorkspaceRelativePath(absoluteUri);
        return workspaceUri?.resolve(relativeUri);
    }

}
