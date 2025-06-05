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
import { injectable, inject } from '@theia/core/shared/inversify';
import { ToolProvider, ToolRequest, ToolRequestParameters, ToolRequestParametersProperties } from '@theia/ai-core';
import { WorkspaceFunctionScope } from './workspace-functions';
import { ChangeSetElementArgs, ChangeSetFileElement, ChangeSetFileElementFactory } from '@theia/ai-chat/lib/browser/change-set-file-element';
import { ChangeSet, MutableChatRequestModel } from '@theia/ai-chat';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { ContentReplacer, Replacement } from '@theia/core/lib/common/content-replacer';
import { URI } from '@theia/core/lib/common/uri';

import {
    SUGGEST_FILE_CONTENT_ID,
    WRITE_FILE_CONTENT_ID,
    SUGGEST_FILE_REPLACEMENTS_ID,
    WRITE_FILE_REPLACEMENTS_ID,
    CLEAR_FILE_CHANGES_ID,
    GET_PROPOSED_CHANGES_ID
} from '../common/file-changeset-function-ids';

@injectable()
export class SuggestFileContent implements ToolProvider {
    static ID = SUGGEST_FILE_CONTENT_ID;

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceFunctionScope: WorkspaceFunctionScope;

    @inject(FileService)
    fileService: FileService;

    @inject(ChangeSetFileElementFactory)
    protected readonly fileChangeFactory: ChangeSetFileElementFactory;

    getTool(): ToolRequest {
        return {
            id: SuggestFileContent.ID,
            name: SuggestFileContent.ID,
            description: `Proposes writing content to a file. If the file exists, it will be overwritten with the provided content.\n
             If the file does not exist, it will be created. This tool will automatically create any directories needed to write the file.\n
             If the new content is empty, the file will be deleted. To move a file, delete it and re-create it at the new location.\n
             The proposed changes will be applied when the user accepts. If called again for the same file, previously proposed changes will be overridden.`,
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The path of the file to write to.'
                    },
                    content: {
                        type: 'string',
                        description: `The content to write to the file. ALWAYS provide the COMPLETE intended content of the file, without any truncation or omissions.\n
                         You MUST include ALL parts of the file, even if they haven\'t been modified.`
                    }
                },
                required: ['path', 'content']
            },
            handler: async (args: string, ctx: MutableChatRequestModel): Promise<string> => {
                const { path, content } = JSON.parse(args);
                const chatSessionId = ctx.session.id;
                const uri = await this.workspaceFunctionScope.resolveRelativePath(path);
                let type: ChangeSetElementArgs['type'] = 'modify';
                if (content === '') {
                    type = 'delete';
                }
                if (!await this.fileService.exists(uri)) {
                    type = 'add';
                }
                ctx.session.changeSet.addElements(
                    this.fileChangeFactory({
                        uri: uri,
                        type,
                        state: 'pending',
                        targetState: content,
                        requestId: ctx.id,
                        chatSessionId
                    })
                );
                ctx.session.changeSet.setTitle('Changes proposed by Coder');
                return `Proposed writing to file ${path}. The user will review and potentially apply the changes`;
            }
        };
    }
}

@injectable()
export class WriteFileContent implements ToolProvider {
    static ID = WRITE_FILE_CONTENT_ID;

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceFunctionScope: WorkspaceFunctionScope;

    @inject(FileService)
    fileService: FileService;

    @inject(ChangeSetFileElementFactory)
    protected readonly fileChangeFactory: ChangeSetFileElementFactory;

    getTool(): ToolRequest {
        return {
            id: WriteFileContent.ID,
            name: WriteFileContent.ID,
            description: `Immediately writes content to a file. If the file exists, it will be overwritten with the provided content.\n
             If the file does not exist, it will be created. This tool will automatically create any directories needed to write the file.\n
             If the new content is empty, the file will be deleted. To move a file, delete it and re-create it at the new location.\n
             Unlike suggestFileContent, this function applies the changes immediately without user confirmation.`,
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The path of the file to write to.'
                    },
                    content: {
                        type: 'string',
                        description: `The content to write to the file. ALWAYS provide the COMPLETE intended content of the file, without any truncation or omissions.\n
                         You MUST include ALL parts of the file, even if they haven\'t been modified.`
                    }
                },
                required: ['path', 'content']
            },
            handler: async (args: string, ctx: MutableChatRequestModel): Promise<string> => {
                const { path, content } = JSON.parse(args);
                const chatSessionId = ctx.session.id;
                const uri = await this.workspaceFunctionScope.resolveRelativePath(path);
                let type = 'modify';
                if (content === '') {
                    type = 'delete';
                }
                if (!await this.fileService.exists(uri)) {
                    type = 'add';
                }

                // Create the file change element
                const fileElement = this.fileChangeFactory({
                    uri: uri,
                    type: type as 'modify' | 'add' | 'delete',
                    state: 'pending',
                    targetState: content,
                    requestId: ctx.id,
                    chatSessionId
                });

                ctx.session.changeSet.setTitle('Changes applied by Coder');
                // Add the element to the change set
                ctx.session.changeSet.addElements(fileElement);

                try {
                    // Immediately apply the change
                    await fileElement.apply();
                    return `Successfully wrote content to file ${path}.`;
                } catch (error) {
                    return `Failed to write content to file ${path}: ${error.message}`;
                }
            }
        };
    }
}

@injectable()
export class ReplaceContentInFileFunctionHelper {
    @inject(WorkspaceFunctionScope)
    protected readonly workspaceFunctionScope: WorkspaceFunctionScope;

    @inject(FileService)
    fileService: FileService;

    @inject(ChangeSetFileElementFactory)
    protected readonly fileChangeFactory: ChangeSetFileElementFactory;

    private replacer: ContentReplacer;

    constructor() {
        this.replacer = new ContentReplacer();
    }

    getToolMetadata(supportMultipleReplace: boolean = false, immediateApplication: boolean = false): { description: string, parameters: ToolRequestParameters } {
        const replacementProperties: ToolRequestParametersProperties = {
            oldContent: {
                type: 'string',
                description: 'The exact content to be replaced. Must match exactly, including whitespace, comments, etc.'
            },
            newContent: {
                type: 'string',
                description: 'The new content to insert in place of matched old content.'
            }
        };

        if (supportMultipleReplace) {
            replacementProperties.multiple = {
                type: 'boolean',
                description: 'Set to true if multiple occurrences of the oldContent are expected to be replaced.'
            };
        }
        const replacementParameters = {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'The path of the file where content will be replaced.'
                },
                replacements: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: replacementProperties,
                        required: ['oldContent', 'newContent']
                    },
                    description: 'An array of replacement objects, each containing oldContent and newContent strings.'
                },
                reset: {
                    type: 'boolean',
                    description: 'Set to true to clear any existing pending changes for this file and start fresh. Default is false, which merges with existing changes.'
                }
            },
            required: ['path', 'replacements']
        } as ToolRequestParameters;

        const replacementSentence = supportMultipleReplace
            ? 'By default, a single occurrence of each old content in the tuples is expected to be replaced. If the optional \'multiple\' flag is set to true, all occurrences will\
             be replaced. In either case, if the number of occurrences in the file does not match the expectation the function will return an error. \
             In that case try a different approach.'
            : 'A single occurrence of each old content in the tuples is expected to be replaced. If the number of occurrences in the file does not match the expectation,\
              the function will return an error. In that case try a different approach.';

        const applicationText = immediateApplication
            ? 'The changes will be applied immediately without user confirmation.'
            : 'The proposed changes will be applied when the user accepts.';

        const replacementDescription = `Propose to replace sections of content in an existing file by providing a list of tuples with old content to be matched and replaced.
            ${replacementSentence}. For deletions, use an empty new content in the tuple.
            Make sure you use the same line endings and whitespace as in the original file content. ${applicationText}
            Multiple calls for the same file will merge replacements unless the reset parameter is set to true. Use the reset parameter to clear previous changes and start
            fresh if needed.`;

        return {
            description: replacementDescription,
            parameters: replacementParameters
        };

    }

    async createChangesetFromToolCall(toolCallString: string, ctx: MutableChatRequestModel): Promise<string> {
        try {
            const result = await this.processReplacementsCommon(toolCallString, ctx, 'Changes proposed by Coder');

            if (result.errors.length > 0) {
                return `Errors encountered: ${result.errors.join('; ')}`;
            }

            if (result.fileElement) {
                const action = result.reset ? 'reset and applied' : 'applied';
                return `Proposed replacements ${action} to file ${result.path}. The user will review and potentially apply the changes.`;
            } else {
                return `No changes needed for file ${result.path}. Content already matches the requested state.`;
            }
        } catch (error) {
            console.debug('Error processing replacements:', error.message);
            return JSON.stringify({ error: error.message });
        }
    }

    async writeChangesetFromToolCall(toolCallString: string, ctx: MutableChatRequestModel): Promise<string> {
        try {
            const result = await this.processReplacementsCommon(toolCallString, ctx, 'Changes applied by Coder');

            if (result.errors.length > 0) {
                return `Errors encountered: ${result.errors.join('; ')}`;
            }

            if (result.fileElement) {
                // Immediately apply the change
                await result.fileElement.apply();

                const action = result.reset ? 'reset and' : '';
                return `Successfully ${action} applied replacements to file ${result.path}.`;
            } else {
                return `No changes needed for file ${result.path}. Content already matches the requested state.`;
            }
        } catch (error) {
            console.debug('Error processing replacements:', error.message);
            return JSON.stringify({ error: error.message });
        }
    }

    private async processReplacementsCommon(
        toolCallString: string,
        ctx: MutableChatRequestModel,
        changeSetTitle: string
    ): Promise<{ fileElement: ChangeSetFileElement | undefined, path: string, reset: boolean, errors: string[] }> {
        const { path, replacements, reset } = JSON.parse(toolCallString) as { path: string, replacements: Replacement[], reset?: boolean };
        const fileUri = await this.workspaceFunctionScope.resolveRelativePath(path);

        // Get the starting content - either original file or existing proposed state
        let startingContent: string;
        if (reset || !ctx.session.changeSet) {
            // Start from original file content
            startingContent = (await this.fileService.read(fileUri)).value.toString();
        } else {
            // Start from existing proposed state if available
            const existingElement = this.findExistingChangeElement(ctx.session.changeSet, fileUri);
            if (existingElement) {
                startingContent = existingElement.targetState || (await this.fileService.read(fileUri)).value.toString();
            } else {
                startingContent = (await this.fileService.read(fileUri)).value.toString();
            }
        }

        const { updatedContent, errors } = this.replacer.applyReplacements(startingContent, replacements);

        if (errors.length > 0) {
            return { fileElement: undefined, path, reset: reset || false, errors };
        }

        // Only create/update changeset if content actually changed
        const originalContent = (await this.fileService.read(fileUri)).value.toString();
        if (updatedContent !== originalContent) {
            ctx.session.changeSet.setTitle(changeSetTitle);

            const fileElement = this.fileChangeFactory({
                uri: fileUri,
                type: 'modify',
                state: 'pending',
                targetState: updatedContent,
                requestId: ctx.id,
                chatSessionId: ctx.session.id
            });

            ctx.session.changeSet.addElements(fileElement);

            return { fileElement, path, reset: reset || false, errors: [] };
        } else {
            return { fileElement: undefined, path, reset: reset || false, errors: [] };
        }
    }

    private findExistingChangeElement(changeSet: ChangeSet, fileUri: URI): ChangeSetFileElement | undefined {
        const element = changeSet.getElementByURI(fileUri);
        if (element instanceof ChangeSetFileElement) { return element; }
    }

    async clearFileChanges(path: string, ctx: MutableChatRequestModel): Promise<string> {
        try {
            const fileUri = await this.workspaceFunctionScope.resolveRelativePath(path);
            if (ctx.session.changeSet.removeElements(fileUri)) {
                return `Cleared pending change(s) for file ${path}.`;
            } else {
                return `No pending changes found for file ${path}.`;
            }
        } catch (error) {
            console.debug('Error clearing file changes:', error.message);
            return JSON.stringify({ error: error.message });
        }
    }

    async getProposedFileState(path: string, ctx: MutableChatRequestModel): Promise<string> {
        try {
            const fileUri = await this.workspaceFunctionScope.resolveRelativePath(path);

            if (!ctx.session.changeSet) {
                // No changeset exists, return original file content
                const originalContent = (await this.fileService.read(fileUri)).value.toString();
                return `File ${path} has no pending changes. Original content:\n\n${originalContent}`;
            }

            const existingElement = this.findExistingChangeElement(ctx.session.changeSet, fileUri);
            if (existingElement && existingElement.targetState) {
                return `File ${path} has pending changes. Proposed content:\n\n${existingElement.targetState}`;
            } else {
                // No pending changes for this file
                const originalContent = (await this.fileService.read(fileUri)).value.toString();
                return `File ${path} has no pending changes. Original content:\n\n${originalContent}`;
            }
        } catch (error) {
            console.debug('Error getting proposed file state:', error.message);
            return JSON.stringify({ error: error.message });
        }
    }
}

@injectable()
export class SimpleSuggestFileReplacements implements ToolProvider {
    static ID = 'simpleSuggestFileReplacements';
    @inject(ReplaceContentInFileFunctionHelper)
    protected readonly replaceContentInFileFunctionHelper: ReplaceContentInFileFunctionHelper;

    getTool(): ToolRequest {
        const metadata = this.replaceContentInFileFunctionHelper.getToolMetadata();
        return {
            id: SimpleSuggestFileReplacements.ID,
            name: SimpleSuggestFileReplacements.ID,
            description: metadata.description,
            parameters: metadata.parameters,
            handler: async (args: string, ctx: MutableChatRequestModel): Promise<string> =>
                this.replaceContentInFileFunctionHelper.createChangesetFromToolCall(args, ctx)
        };
    }
}

@injectable()
export class SimpleWriteFileReplacements implements ToolProvider {
    static ID = 'simpleWriteFileReplacements';
    @inject(ReplaceContentInFileFunctionHelper)
    protected readonly replaceContentInFileFunctionHelper: ReplaceContentInFileFunctionHelper;

    getTool(): ToolRequest {
        const metadata = this.replaceContentInFileFunctionHelper.getToolMetadata(false, true);
        return {
            id: SimpleWriteFileReplacements.ID,
            name: SimpleWriteFileReplacements.ID,
            description: metadata.description,
            parameters: metadata.parameters,
            handler: async (args: string, ctx: MutableChatRequestModel): Promise<string> =>
                this.replaceContentInFileFunctionHelper.writeChangesetFromToolCall(args, ctx)
        };
    }
}

@injectable()
export class SuggestFileReplacements implements ToolProvider {
    static ID = SUGGEST_FILE_REPLACEMENTS_ID;
    @inject(ReplaceContentInFileFunctionHelper)
    protected readonly replaceContentInFileFunctionHelper: ReplaceContentInFileFunctionHelper;

    getTool(): ToolRequest {
        const metadata = this.replaceContentInFileFunctionHelper.getToolMetadata(true);
        return {
            id: SuggestFileReplacements.ID,
            name: SuggestFileReplacements.ID,
            description: metadata.description,
            parameters: metadata.parameters,
            handler: async (args: string, ctx: MutableChatRequestModel): Promise<string> =>
                this.replaceContentInFileFunctionHelper.createChangesetFromToolCall(args, ctx)
        };
    }
}

@injectable()
export class WriteFileReplacements implements ToolProvider {
    static ID = WRITE_FILE_REPLACEMENTS_ID;
    @inject(ReplaceContentInFileFunctionHelper)
    protected readonly replaceContentInFileFunctionHelper: ReplaceContentInFileFunctionHelper;

    getTool(): ToolRequest {
        const metadata = this.replaceContentInFileFunctionHelper.getToolMetadata(true, true);
        return {
            id: WriteFileReplacements.ID,
            name: WriteFileReplacements.ID,
            description: metadata.description,
            parameters: metadata.parameters,
            handler: async (args: string, ctx: MutableChatRequestModel): Promise<string> =>
                this.replaceContentInFileFunctionHelper.writeChangesetFromToolCall(args, ctx)
        };
    }
}

@injectable()
export class ClearFileChanges implements ToolProvider {
    static ID = CLEAR_FILE_CHANGES_ID;
    @inject(ReplaceContentInFileFunctionHelper)
    protected readonly replaceContentInFileFunctionHelper: ReplaceContentInFileFunctionHelper;

    getTool(): ToolRequest {
        return {
            id: ClearFileChanges.ID,
            name: ClearFileChanges.ID,
            description: 'Clears all pending changes for a specific file, allowing you to start fresh with new modifications.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The path of the file to clear pending changes for.'
                    }
                },
                required: ['path']
            },
            handler: async (args: string, ctx: MutableChatRequestModel): Promise<string> => {
                const { path } = JSON.parse(args);
                return this.replaceContentInFileFunctionHelper.clearFileChanges(path, ctx);
            }
        };
    }
}

@injectable()
export class GetProposedFileState implements ToolProvider {
    static ID = GET_PROPOSED_CHANGES_ID;
    @inject(ReplaceContentInFileFunctionHelper)
    protected readonly replaceContentInFileFunctionHelper: ReplaceContentInFileFunctionHelper;

    getTool(): ToolRequest {
        return {
            id: GET_PROPOSED_CHANGES_ID,
            name: GET_PROPOSED_CHANGES_ID,
            description: 'Returns the current proposed state of a file, including all pending changes that have been proposed ' +
                'but not yet applied. This allows you to inspect the current state before making additional changes.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The path of the file to get the proposed state for.'
                    }
                },
                required: ['path']
            },
            handler: async (args: string, ctx: MutableChatRequestModel): Promise<string> => {
                const { path } = JSON.parse(args);
                return this.replaceContentInFileFunctionHelper.getProposedFileState(path, ctx);
            }
        };
    }
}
