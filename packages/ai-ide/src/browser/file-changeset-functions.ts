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
import { assertChatContext, ChatToolContext } from '@theia/ai-chat';
import { ChangeSet } from '@theia/ai-chat/lib/common/change-set';
import { ChangeSetElementArgs, ChangeSetFileElement, ChangeSetFileElementFactory } from '@theia/ai-chat/lib/browser/change-set-file-element';
import { ToolInvocationContext, ToolProvider, ToolRequest, ToolRequestParameters, ToolRequestParametersProperties } from '@theia/ai-core';
import { ContentReplacerV1Impl, Replacement, ContentReplacer } from '@theia/core/lib/common/content-replacer';
import { ContentReplacerV2Impl } from '@theia/core/lib/common/content-replacer-v2-impl';
import { URI } from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceFunctionScope } from './workspace-functions';

import { nls } from '@theia/core';
import {
    CLEAR_FILE_CHANGES_ID,
    GET_PROPOSED_CHANGES_ID,
    SUGGEST_FILE_CONTENT_ID,
    SUGGEST_FILE_REPLACEMENTS_ID,
    WRITE_FILE_CONTENT_ID,
    WRITE_FILE_REPLACEMENTS_ID,
    SUGGEST_FILE_REPLACEMENTS_SIMPLE_ID,
    WRITE_FILE_REPLACEMENTS_SIMPLE_ID
} from '../common/file-changeset-function-ids';

function createPathShortLabel(args: string, hasMore: boolean): { label: string; hasMore: boolean } | undefined {
    try {
        const parsed = JSON.parse(args);
        if (parsed && typeof parsed === 'object' && 'path' in parsed) {
            return { label: String(parsed.path), hasMore };
        }
    } catch {
        // ignore parse errors
    }
    return undefined;
}

export const FileChangeSetTitleProvider = Symbol('FileChangeSetTitleProvider');

export interface FileChangeSetTitleProvider {
    getChangeSetTitle(ctx: ChatToolContext): string;
}

@injectable()
export class SuggestFileContent implements ToolProvider {
    static ID = SUGGEST_FILE_CONTENT_ID;

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceFunctionScope: WorkspaceFunctionScope;

    @inject(FileService)
    fileService: FileService;

    @inject(ChangeSetFileElementFactory)
    protected readonly fileChangeFactory: ChangeSetFileElementFactory;

    @inject(FileChangeSetTitleProvider)
    protected readonly fileChangeSetTitleProvider: FileChangeSetTitleProvider;

    getTool(): ToolRequest {
        return {
            id: SuggestFileContent.ID,
            name: SuggestFileContent.ID,
            description: `Proposes writing complete content to a file for user review. If the file exists, it will be overwritten with the provided content.
             If the file does not exist, it will be created. This tool will automatically create any directories needed to write the file.
             If the new content is empty, the file will be deleted. To move a file, delete it and re-create it at the new location.
             The proposed changes will be applied when the user accepts. If called again for the same file, previously proposed changes will be overridden.
             Use this for creating new files or when you need to rewrite an entire file.
             For targeted edits to existing files, prefer suggestFileReplacements instead - it's more efficient and shows clearer diffs.`,
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Relative path to the file within the workspace (e.g., "src/index.ts", "config/settings.json").'
                    },
                    content: {
                        type: 'string',
                        description: `The COMPLETE content to write to the file. You MUST include ALL parts of the file, even if they haven't been modified.
                         Do not truncate or omit any sections. Use empty string "" to delete the file.`
                    }
                },
                required: ['path', 'content']
            },
            handler: async (args: string, ctx?: ToolInvocationContext): Promise<string> => {
                assertChatContext(ctx);
                if (ctx.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                const { path, content } = JSON.parse(args);
                const chatSessionId = ctx.request.session.id;
                const uri = await this.workspaceFunctionScope.resolveRelativePath(path);
                let type: ChangeSetElementArgs['type'] = 'modify';
                if (content === '') {
                    type = 'delete';
                }
                if (!(await this.fileService.exists(uri))) {
                    type = 'add';
                }
                ctx.request.session.changeSet.addElements(
                    this.fileChangeFactory({
                        uri: uri,
                        type,
                        state: 'pending',
                        targetState: content,
                        requestId: ctx.request.id,
                        chatSessionId
                    })
                );

                ctx.request.session.changeSet.setTitle(this.fileChangeSetTitleProvider.getChangeSetTitle(ctx));
                return `Proposed writing to file ${path}. The user will review and potentially apply the changes`;
            },
            getArgumentsShortLabel: (args: string) => createPathShortLabel(args, true),
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

    @inject(FileChangeSetTitleProvider)
    protected readonly fileChangeSetTitleProvider: FileChangeSetTitleProvider;

    getTool(): ToolRequest {
        return {
            id: WriteFileContent.ID,
            name: WriteFileContent.ID,
            description: `Immediately writes complete content to a file WITHOUT user confirmation. If the file exists, it will be overwritten.
             If the file does not exist, it will be created. This tool will automatically create any directories needed to write the file.
             If the new content is empty, the file will be deleted. To move a file, delete it and re-create it at the new location.
             Use this for creating new files or complete file rewrites in agent mode.
             For targeted edits, prefer writeFileReplacements - it's more efficient and less error-prone.
             CAUTION: Changes are applied immediately and cannot be undone through the chat interface.`,
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Relative path to the file within the workspace (e.g., "src/index.ts", "config/settings.json").'
                    },
                    content: {
                        type: 'string',
                        description: `The COMPLETE content to write to the file. You MUST include ALL parts of the file, even if they haven't been modified.
                         Do not truncate or omit any sections. Use empty string "" to delete the file.`
                    }
                },
                required: ['path', 'content']
            },
            handler: async (args: string, ctx?: ToolInvocationContext): Promise<string> => {
                assertChatContext(ctx);
                if (ctx.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                const { path, content } = JSON.parse(args);
                const chatSessionId = ctx.request.session.id;
                const uri = await this.workspaceFunctionScope.resolveRelativePath(path);
                let type = 'modify';
                if (content === '') {
                    type = 'delete';
                }
                if (!(await this.fileService.exists(uri))) {
                    type = 'add';
                }

                const fileElement = this.fileChangeFactory({
                    uri: uri,
                    type: type as 'modify' | 'add' | 'delete',
                    state: 'pending',
                    targetState: content,
                    requestId: ctx.request.id,
                    chatSessionId
                });

                ctx.request.session.changeSet.setTitle(this.fileChangeSetTitleProvider.getChangeSetTitle(ctx));
                ctx.request.session.changeSet.addElements(fileElement);

                try {
                    await fileElement.apply();
                    return `Successfully wrote content to file ${path}.`;
                } catch (error) {
                    return `Failed to write content to file ${path}: ${error.message}`;
                }
            },
            getArgumentsShortLabel: (args: string) => createPathShortLabel(args, true),
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

    @inject(FileChangeSetTitleProvider)
    protected readonly fileChangeSetTitleProvider: FileChangeSetTitleProvider;

    private replacer: ContentReplacer;

    constructor() {
        this.replacer = new ContentReplacerV1Impl();
    }

    protected setReplacer(replacer: ContentReplacer): void {
        this.replacer = replacer;
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
                    description: 'Relative path to the file within the workspace (e.g., "src/index.ts"). Must read the file with getFileContent first.'
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
            fresh if needed.

            IMPORTANT: Each oldContent must match exactly (including whitespace and indentation).
            If replacements fail with "Expected 1 occurrence but found 0": re-read the file, the content may have changed or whitespace differs.
            If replacements fail with "found 2+": include more surrounding context in oldContent to make it unique.
            Always use getFileContent to read the current file state before making replacements.`;

        return {
            description: replacementDescription,
            parameters: replacementParameters
        };
    }

    async createChangesetFromToolCall(toolCallString: string, ctx: ChatToolContext): Promise<string> {
        try {
            if (ctx.cancellationToken?.isCancellationRequested) {
                return JSON.stringify({ error: 'Operation cancelled by user' });
            }

            const result = await this.processReplacementsCommon(toolCallString, ctx, this.fileChangeSetTitleProvider.getChangeSetTitle(ctx));

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

    async writeChangesetFromToolCall(toolCallString: string, ctx: ChatToolContext): Promise<string> {
        try {
            if (ctx.cancellationToken?.isCancellationRequested) {
                return JSON.stringify({ error: 'Operation cancelled by user' });
            }

            const result = await this.processReplacementsCommon(toolCallString, ctx, this.fileChangeSetTitleProvider.getChangeSetTitle(ctx));

            if (result.errors.length > 0) {
                return `Errors encountered: ${result.errors.join('; ')}`;
            }

            if (result.fileElement) {
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
        ctx: ChatToolContext,
        changeSetTitle: string
    ): Promise<{ fileElement: ChangeSetFileElement | undefined, path: string, reset: boolean, errors: string[] }> {
        if (ctx.cancellationToken?.isCancellationRequested) {
            throw new Error('Operation cancelled by user');
        }

        const { path, replacements, reset } = JSON.parse(toolCallString) as { path: string, replacements: Replacement[], reset?: boolean };
        const fileUri = await this.workspaceFunctionScope.resolveRelativePath(path);

        let startingContent: string;
        if (reset || !ctx.request.session.changeSet) {
            startingContent = (await this.fileService.read(fileUri)).value.toString();
        } else {
            const existingElement = this.findExistingChangeElement(ctx.request.session.changeSet, fileUri);
            if (existingElement) {
                startingContent = existingElement.targetState || (await this.fileService.read(fileUri)).value.toString();
            } else {
                startingContent = (await this.fileService.read(fileUri)).value.toString();
            }
        }

        if (ctx.cancellationToken?.isCancellationRequested) {
            throw new Error('Operation cancelled by user');
        }

        const { updatedContent, errors } = this.replacer.applyReplacements(startingContent, replacements);

        if (errors.length > 0) {
            return { fileElement: undefined, path, reset: reset || false, errors };
        }

        const originalContent = (await this.fileService.read(fileUri)).value.toString();
        if (updatedContent !== originalContent) {
            ctx.request.session.changeSet.setTitle(changeSetTitle);

            const fileElement = this.fileChangeFactory({
                uri: fileUri,
                type: 'modify',
                state: 'pending',
                targetState: updatedContent,
                requestId: ctx.request.id,
                chatSessionId: ctx.request.session.id
            });

            ctx.request.session.changeSet.addElements(fileElement);

            return { fileElement, path, reset: reset || false, errors: [] };
        } else {
            return { fileElement: undefined, path, reset: reset || false, errors: [] };
        }
    }

    private findExistingChangeElement(changeSet: ChangeSet, fileUri: URI): ChangeSetFileElement | undefined {
        const element = changeSet.getElementByURI(fileUri);
        if (element instanceof ChangeSetFileElement) {
            return element;
        }
    }

    async clearFileChanges(path: string, ctx: ChatToolContext): Promise<string> {
        try {
            if (ctx.cancellationToken?.isCancellationRequested) {
                return JSON.stringify({ error: 'Operation cancelled by user' });
            }

            const fileUri = await this.workspaceFunctionScope.resolveRelativePath(path);
            if (ctx.request.session.changeSet.removeElements(fileUri)) {
                return `Cleared pending change(s) for file ${path}.`;
            } else {
                return `No pending changes found for file ${path}.`;
            }
        } catch (error) {
            console.debug('Error clearing file changes:', error.message);
            return JSON.stringify({ error: error.message });
        }
    }

    async getProposedFileState(path: string, ctx: ChatToolContext): Promise<string> {
        try {
            if (ctx.cancellationToken?.isCancellationRequested) {
                return JSON.stringify({ error: 'Operation cancelled by user' });
            }

            const fileUri = await this.workspaceFunctionScope.resolveRelativePath(path);

            if (!ctx.request.session.changeSet) {
                const originalContent = (await this.fileService.read(fileUri)).value.toString();
                return `File ${path} has no pending changes. Original content:\n\n${originalContent}`;
            }

            const existingElement = this.findExistingChangeElement(ctx.request.session.changeSet, fileUri);
            if (existingElement && existingElement.targetState) {
                return `File ${path} has pending changes. Proposed content:\n\n${existingElement.targetState}`;
            } else {
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
            handler: async (args: string, ctx?: ToolInvocationContext): Promise<string> => {
                assertChatContext(ctx);
                if (ctx.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                return this.replaceContentInFileFunctionHelper.createChangesetFromToolCall(args, ctx);
            },
            getArgumentsShortLabel: (args: string) => createPathShortLabel(args, true),
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
            handler: async (args: string, ctx?: ToolInvocationContext): Promise<string> => {
                assertChatContext(ctx);
                if (ctx.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                return this.replaceContentInFileFunctionHelper.writeChangesetFromToolCall(args, ctx);
            },
            getArgumentsShortLabel: (args: string) => createPathShortLabel(args, true),
        };
    }
}

@injectable()
export class SuggestFileReplacements_Simple implements ToolProvider {
    static ID = SUGGEST_FILE_REPLACEMENTS_SIMPLE_ID;
    @inject(ReplaceContentInFileFunctionHelper)
    protected readonly replaceContentInFileFunctionHelper: ReplaceContentInFileFunctionHelper;

    getTool(): ToolRequest {
        const metadata = this.replaceContentInFileFunctionHelper.getToolMetadata(true);
        return {
            id: SuggestFileReplacements_Simple.ID,
            name: SuggestFileReplacements_Simple.ID,
            description: metadata.description,
            parameters: metadata.parameters,
            handler: async (args: string, ctx?: ToolInvocationContext): Promise<string> => {
                assertChatContext(ctx);
                if (ctx.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                return this.replaceContentInFileFunctionHelper.createChangesetFromToolCall(args, ctx);
            },
            getArgumentsShortLabel: (args: string) => createPathShortLabel(args, true),
        };
    }
}

/**
 * Legacy WriteFileReplacements implementation using V1 content replacer.
 * @deprecated Use WriteFileReplacements instead which uses the improved V2 implementation.
 */
@injectable()
export class WriteFileReplacements_Simple implements ToolProvider {
    static ID = WRITE_FILE_REPLACEMENTS_SIMPLE_ID;
    @inject(ReplaceContentInFileFunctionHelper)
    protected readonly replaceContentInFileFunctionHelper: ReplaceContentInFileFunctionHelper;

    getTool(): ToolRequest {
        const metadata = this.replaceContentInFileFunctionHelper.getToolMetadata(true, true);
        return {
            id: WriteFileReplacements_Simple.ID,
            name: WriteFileReplacements_Simple.ID,
            description: metadata.description,
            parameters: metadata.parameters,
            handler: async (args: string, ctx?: ToolInvocationContext): Promise<string> => {
                assertChatContext(ctx);
                if (ctx.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                return this.replaceContentInFileFunctionHelper.writeChangesetFromToolCall(args, ctx);
            },
            getArgumentsShortLabel: (args: string) => createPathShortLabel(args, true),
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
            description: 'Clears all pending (not yet applied) changes for a specific file, allowing you to start fresh with new modifications. ' +
                'Use this when previous replacement attempts failed and you want to try a different approach. ' +
                'Does not affect already-applied changes or the actual file on disk.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Relative path to the file within the workspace (e.g., "src/index.ts").'
                    }
                },
                required: ['path']
            },
            handler: async (args: string, ctx?: ToolInvocationContext): Promise<string> => {
                assertChatContext(ctx);
                if (ctx.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                const { path } = JSON.parse(args);
                return this.replaceContentInFileFunctionHelper.clearFileChanges(path, ctx);
            },
            getArgumentsShortLabel: (args: string) => createPathShortLabel(args, false),
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
                'but not yet applied. Use this to see what the file will look like after your changes are applied. ' +
                'This is useful when making incremental changes to verify the accumulated state is correct. ' +
                'If no pending changes exist for the file, returns the original file content.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Relative path to the file within the workspace (e.g., "src/index.ts").'
                    }
                },
                required: ['path']
            },
            handler: async (args: string, ctx?: ToolInvocationContext): Promise<string> => {
                assertChatContext(ctx);
                if (ctx.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                const { path } = JSON.parse(args);
                return this.replaceContentInFileFunctionHelper.getProposedFileState(path, ctx);
            },
            getArgumentsShortLabel: (args: string) => createPathShortLabel(args, false),
        };
    }
}

@injectable()
export class ReplaceContentInFileFunctionHelperV2 extends ReplaceContentInFileFunctionHelper {
    constructor() {
        super();
        this.setReplacer(new ContentReplacerV2Impl());
    }
}

@injectable()
export class SuggestFileReplacements implements ToolProvider {
    static ID = SUGGEST_FILE_REPLACEMENTS_ID;

    @inject(ReplaceContentInFileFunctionHelperV2)
    protected readonly replaceContentInFileFunctionHelper: ReplaceContentInFileFunctionHelperV2;

    getTool(): ToolRequest {
        const metadata = this.replaceContentInFileFunctionHelper.getToolMetadata(true);
        return {
            id: SuggestFileReplacements.ID,
            name: SuggestFileReplacements.ID,
            description: `Proposes to replace sections of content in an existing file by providing a list of replacements.
            Each replacement consists of oldContent to be matched and newContent to insert in its place.
            By default, a single occurrence of each oldContent is expected. If the 'multiple' flag is set to true, all occurrences will be replaced.
            For deletions, use an empty newContent.
            The proposed changes will be applied when the user accepts.
            Multiple calls for the same file will merge replacements unless the reset parameter is set to true.

            IMPORTANT: Each oldContent must appear exactly once in the file (unless 'multiple' is true).
            If you see "Expected 1 occurrence but found X" errors:
            - If found 0: The content doesn't exist, has different whitespace/indentation, or the file changed. Re-read the file first.
            - If found 2+: Add more surrounding lines to oldContent to make it unique.
            Common mistakes: Missing/extra trailing newlines, wrong indentation, outdated content.
            Always read the file with getFileContent before attempting replacements.`,
            parameters: metadata.parameters,
            handler: async (args: string, ctx?: ToolInvocationContext): Promise<string> => {
                assertChatContext(ctx);
                if (ctx.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                return this.replaceContentInFileFunctionHelper.createChangesetFromToolCall(args, ctx);
            },
            getArgumentsShortLabel: (args: string) => createPathShortLabel(args, true),
        };
    }
}

@injectable()
export class WriteFileReplacements implements ToolProvider {
    static ID = WRITE_FILE_REPLACEMENTS_ID;

    @inject(ReplaceContentInFileFunctionHelperV2)
    protected readonly replaceContentInFileFunctionHelper: ReplaceContentInFileFunctionHelperV2;

    getTool(): ToolRequest {
        const metadata = this.replaceContentInFileFunctionHelper.getToolMetadata(true, true);
        return {
            id: WriteFileReplacements.ID,
            name: WriteFileReplacements.ID,
            description: metadata.description,
            parameters: metadata.parameters,
            handler: async (args: string, ctx?: ToolInvocationContext): Promise<string> => {
                assertChatContext(ctx);
                if (ctx.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                return this.replaceContentInFileFunctionHelper.writeChangesetFromToolCall(args, ctx);
            },
            getArgumentsShortLabel: (args: string) => createPathShortLabel(args, true),
        };
    }
}

@injectable()
export class DefaultFileChangeSetTitleProvider implements FileChangeSetTitleProvider {
    getChangeSetTitle(_ctx: ChatToolContext): string {
        return nls.localize('theia/ai-chat/fileChangeSetTitle', 'Changes proposed');
    }
}
