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
import { Summary, TaskContextStorageService } from '@theia/ai-chat/lib/browser/task-context-service';
import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { generateUuid } from '@theia/core';
import { ContentReplacer, Replacement } from '@theia/core/lib/common/content-replacer';
import { ContentReplacerV2Impl } from '@theia/core/lib/common/content-replacer-v2-impl';
import { inject, injectable } from '@theia/core/shared/inversify';
import {
    CREATE_TASK_CONTEXT_FUNCTION_ID,
    GET_TASK_CONTEXT_FUNCTION_ID,
    EDIT_TASK_CONTEXT_FUNCTION_ID,
    LIST_TASK_CONTEXTS_FUNCTION_ID,
    REWRITE_TASK_CONTEXT_FUNCTION_ID
} from '../common/task-context-function-ids';

/**
 * Function for creating a new task context (implementation plan).
 * Creates a task context with auto-generated metadata and opens it in the editor.
 */
@injectable()
export class CreateTaskContextFunction implements ToolProvider {
    static ID = CREATE_TASK_CONTEXT_FUNCTION_ID;

    @inject(TaskContextStorageService)
    protected readonly storageService: TaskContextStorageService;

    getTool(): ToolRequest {
        return {
            id: CreateTaskContextFunction.ID,
            name: CreateTaskContextFunction.ID,
            description: 'Create a new task context (implementation plan) for the current session. ' +
                'The plan will be stored and opened in the editor so the user can see it. ' +
                'Use this to document the implementation plan after exploring the codebase.',
            parameters: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: 'Title for the task context (e.g., "Add user authentication feature")'
                    },
                    content: {
                        type: 'string',
                        description: 'The plan content in markdown format. Should include: Goal, Design, Implementation Steps (with file paths), ' +
                            'Reference Examples, and Verification.'
                    }
                },
                required: ['title', 'content']
            },
            handler: async (args: string, ctx: MutableChatRequestModel): Promise<string> => {
                if (ctx?.response?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }

                try {
                    const { title, content } = JSON.parse(args);
                    const summaryId = generateUuid();
                    const summary: Summary = {
                        id: summaryId,
                        label: title,
                        summary: content,
                        sessionId: ctx.session.id
                    };

                    await this.storageService.store(summary);
                    // Open the plan in editor so user can see it
                    await this.storageService.open(summaryId);

                    return `Created task context "${title}" (id: ${summaryId}) - now visible in editor. The user can review and edit the plan directly.`;
                } catch (error) {
                    return JSON.stringify({ error: `Failed to create task context: ${error.message}` });
                }
            }
        };
    }
}

/**
 * Function for reading the current task context.
 * Returns the content of the task context for the current session or a specified ID.
 */
@injectable()
export class GetTaskContextFunction implements ToolProvider {
    static ID = GET_TASK_CONTEXT_FUNCTION_ID;

    @inject(TaskContextStorageService)
    protected readonly storageService: TaskContextStorageService;

    getTool(): ToolRequest {
        return {
            id: GetTaskContextFunction.ID,
            name: GetTaskContextFunction.ID,
            description: 'Read the current task context (implementation plan). ' +
                'Always call this before editing to ensure you have the latest version, ' +
                'as the user may have edited the plan directly in the editor.',
            parameters: {
                type: 'object',
                properties: {
                    taskContextId: {
                        type: 'string',
                        description: 'Optional task context ID. If not provided, returns the task context for the current session.'
                    }
                },
                required: []
            },
            handler: async (args: string, ctx: MutableChatRequestModel): Promise<string> => {
                if (ctx?.response?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }

                try {
                    const parsed = args ? JSON.parse(args) : {};
                    const taskContextId: string | undefined = parsed.taskContextId;

                    // If specific ID provided, use it; otherwise the most recent task context for current session
                    let summary: Summary | undefined;
                    if (taskContextId) {
                        summary = await this.storageService.get(taskContextId);
                    } else {
                        const allSummaries = this.storageService.getAll();
                        const sessionSummaries = allSummaries.filter(s => s.sessionId === ctx.session.id);
                        summary = sessionSummaries[sessionSummaries.length - 1];
                    }

                    if (!summary) {
                        return 'No task context found for this session. Use createTaskContext to create one.';
                    }

                    return summary.summary;
                } catch (error) {
                    return JSON.stringify({ error: `Failed to get task context: ${error.message}` });
                }
            }
        };
    }
}

/**
 * Function for editing a task context with string replacement.
 * Applies targeted edits to the task context and opens it in the editor.
 */
@injectable()
export class EditTaskContextFunction implements ToolProvider {
    static ID = EDIT_TASK_CONTEXT_FUNCTION_ID;

    @inject(TaskContextStorageService)
    protected readonly storageService: TaskContextStorageService;

    protected readonly contentReplacer: ContentReplacer = new ContentReplacerV2Impl();

    getTool(): ToolRequest {
        return {
            id: EditTaskContextFunction.ID,
            name: EditTaskContextFunction.ID,
            description: 'Edit the current task context by replacing specific content. ' +
                'The plan will be updated and opened in the editor so the user can see the changes. ' +
                'The oldContent must appear exactly once in the plan. ' +
                'IMPORTANT: Always call getTaskContext first to read the latest version before editing, ' +
                'as the user may have edited the plan directly. ' +
                'If you see "not found" errors: The content does not exist, has different whitespace, or the plan changed. Re-read with getTaskContext first. ' +
                'If you see "multiple occurrences" errors: Add more surrounding lines to oldContent to make it unique. ' +
                'Common mistakes: Missing/extra trailing newlines, wrong indentation, outdated content. ' +
                'If edits continue to fail, use rewriteTaskContext to replace the entire content.',
            parameters: {
                type: 'object',
                properties: {
                    oldContent: {
                        type: 'string',
                        description: 'The exact content to be replaced. Must match exactly, including whitespace and indentation.'
                    },
                    newContent: {
                        type: 'string',
                        description: 'The replacement text. For deletions, use an empty string.'
                    },
                    taskContextId: {
                        type: 'string',
                        description: 'Optional task context ID. If not provided, edits the task context for the current session.'
                    }
                },
                required: ['oldContent', 'newContent']
            },
            handler: async (args: string, ctx: MutableChatRequestModel): Promise<string> => {
                if (ctx?.response?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }

                try {
                    const { oldContent, newContent, taskContextId } = JSON.parse(args);

                    // If specific ID provided, use it; otherwise the most recent task context for current session
                    let summary: Summary | undefined;
                    if (taskContextId) {
                        summary = await this.storageService.get(taskContextId);
                    } else {
                        const allSummaries = this.storageService.getAll();
                        const sessionSummaries = allSummaries.filter(s => s.sessionId === ctx.session.id);
                        summary = sessionSummaries[sessionSummaries.length - 1]; // Most recently added
                    }

                    if (!summary) {
                        return 'No task context found for this session. Use createTaskContext to create one first.';
                    }

                    const replacement: Replacement = { oldContent, newContent };
                    const { updatedContent, errors } = this.contentReplacer.applyReplacements(summary.summary, [replacement]);

                    if (errors.length > 0) {
                        return 'Edit failed: ' + errors.join('; ') + '. ' +
                            'The user may have edited the plan directly. ' +
                            'Use getTaskContext to read the current content and try again. ' +
                            'If edits continue to fail, use rewriteTaskContext to replace the entire content.';
                    }

                    const updatedSummary: Summary = {
                        ...summary,
                        summary: updatedContent
                    };
                    await this.storageService.store(updatedSummary);

                    await this.storageService.open(summary.id);

                    return 'Task context updated successfully - changes visible in editor.';
                } catch (error) {
                    return JSON.stringify({ error: `Failed to edit task context: ${error.message}` });
                }
            }
        };
    }
}

/**
 * Function for listing all task contexts for the current session.
 * Useful when the agent has created multiple plans and needs to see what exists.
 */
@injectable()
export class ListTaskContextsFunction implements ToolProvider {
    static ID = LIST_TASK_CONTEXTS_FUNCTION_ID;

    @inject(TaskContextStorageService)
    protected readonly storageService: TaskContextStorageService;

    getTool(): ToolRequest {
        return {
            id: ListTaskContextsFunction.ID,
            name: ListTaskContextsFunction.ID,
            description: 'List all task contexts (plans) for the current session. ' +
                'Use this to see what plans exist and their IDs.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            },
            handler: async (args: string, ctx: MutableChatRequestModel): Promise<string> => {
                if (ctx?.response?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }

                try {
                    const allSummaries = this.storageService.getAll();
                    const sessionSummaries = allSummaries.filter(s => s.sessionId === ctx.session.id);

                    if (sessionSummaries.length === 0) {
                        return 'No task contexts found for this session.';
                    }

                    const list = sessionSummaries.map((s, i) =>
                        `${i + 1}. "${s.label}" (id: ${s.id})`
                    ).join('\n');

                    return `Task contexts for this session:\n${list}\n\nMost recent: "${sessionSummaries[sessionSummaries.length - 1].label}"`;
                } catch (error) {
                    return JSON.stringify({ error: `Failed to list task contexts: ${error.message}` });
                }
            }
        };
    }
}

/**
 * Function for completely rewriting a task context.
 * Fallback when edits fail repeatedly - replaces the entire content.
 */
@injectable()
export class RewriteTaskContextFunction implements ToolProvider {
    static ID = REWRITE_TASK_CONTEXT_FUNCTION_ID;

    @inject(TaskContextStorageService)
    protected readonly storageService: TaskContextStorageService;

    getTool(): ToolRequest {
        return {
            id: RewriteTaskContextFunction.ID,
            name: RewriteTaskContextFunction.ID,
            description: 'Completely rewrite a task context with new content. ' +
                'Use this as a fallback when editTaskContext fails repeatedly, ' +
                'for example when the user has made significant changes to the plan. ' +
                'The plan will be updated and opened in the editor so the user can see the changes.',
            parameters: {
                type: 'object',
                properties: {
                    content: {
                        type: 'string',
                        description: 'The complete new content for the task context in markdown format.'
                    },
                    taskContextId: {
                        type: 'string',
                        description: 'Optional task context ID. If not provided, rewrites the task context for the current session.'
                    }
                },
                required: ['content']
            },
            handler: async (args: string, ctx: MutableChatRequestModel): Promise<string> => {
                if (ctx?.response?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }

                try {
                    const { content, taskContextId } = JSON.parse(args);

                    // If specific ID provided, use it; otherwise the most recent task context for current session
                    let summary: Summary | undefined;
                    if (taskContextId) {
                        summary = await this.storageService.get(taskContextId);
                    } else {
                        const allSummaries = this.storageService.getAll();
                        const sessionSummaries = allSummaries.filter(s => s.sessionId === ctx.session.id);
                        summary = sessionSummaries[sessionSummaries.length - 1]; // Most recently added
                    }

                    if (!summary) {
                        return 'No task context found for this session. Use createTaskContext to create one first.';
                    }

                    const updatedSummary: Summary = {
                        ...summary,
                        summary: content
                    };
                    await this.storageService.store(updatedSummary);

                    await this.storageService.open(summary.id);

                    return 'Task context rewritten successfully - changes visible in editor.';
                } catch (error) {
                    return JSON.stringify({ error: `Failed to rewrite task context: ${error.message}` });
                }
            }
        };
    }
}
