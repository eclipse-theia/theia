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

import { assertChatContext, ChatToolContext } from '@theia/ai-chat';
import { Summary, TaskContextStorageService } from '@theia/ai-chat/lib/browser/task-context-service';
import { TASK_CONTEXT_VARIABLE } from '@theia/ai-chat/lib/browser/task-context-variable';
import { ToolInvocationContext, ToolProvider, ToolRequest } from '@theia/ai-core';
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

export function getAttachedTaskContextIds(ctx: ChatToolContext): string[] {
    return ctx.request.session.context.getVariables()
        .filter(candidate => candidate.variable.id === TASK_CONTEXT_VARIABLE.id && !!candidate.arg)
        .map(candidate => candidate.arg!);
}

interface CollectedTaskContexts {
    sessionSummaries: Summary[];
    attachedSummaries: Summary[];
}

async function collectTaskContextSummaries(storageService: TaskContextStorageService, ctx: ChatToolContext): Promise<CollectedTaskContexts> {
    // Use root session if this is a delegated session, otherwise use current session
    const targetSessionId = ctx.rootSessionId || ctx.request.session.id;
    const sessionSummaries = storageService.getAll().filter(candidate => candidate.sessionId === targetSessionId);
    // Also resolve task contexts attached to the chat context, e.g. plans from previous sessions, skipping unresolvable ids
    const attachedCandidates = await Promise.all(
        getAttachedTaskContextIds(ctx)
            .filter(id => !sessionSummaries.some(candidate => candidate.id === id))
            .map(id => storageService.get(id))
    );
    const attachedSummaries = attachedCandidates.filter((candidate): candidate is Summary => candidate !== undefined);
    return { sessionSummaries, attachedSummaries };
}

async function findTaskContextSummary(storageService: TaskContextStorageService, ctx: ChatToolContext, taskContextId?: string): Promise<Summary | undefined> {
    if (taskContextId) {
        return storageService.get(taskContextId);
    }
    const { sessionSummaries, attachedSummaries } = await collectTaskContextSummaries(storageService, ctx);
    if (sessionSummaries.length > 0) {
        return sessionSummaries[sessionSummaries.length - 1];
    }
    return attachedSummaries[attachedSummaries.length - 1];
}

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
                'Use this to document the implementation plan after exploring the codebase. ' +
                'Check for an existing task context with getTaskContext first to avoid creating a duplicate plan.',
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
            handler: async (args: string, ctx?: ToolInvocationContext): Promise<string> => {
                assertChatContext(ctx);
                if (ctx.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }

                try {
                    const { title, content } = JSON.parse(args);
                    const summaryId = generateUuid();
                    // Store task context in root session if this is a delegated session,
                    // so it's accessible across the entire delegation chain
                    const targetSessionId = ctx.rootSessionId || ctx.request.session.id;
                    const summary: Summary = {
                        id: summaryId,
                        label: title,
                        summary: content,
                        sessionId: targetSessionId
                    };

                    await this.storageService.store(summary);
                    await this.storageService.open(summaryId);

                    return `Created task context "${title}" (id: ${summaryId}) - now visible in editor. The user can review and edit the plan directly.`;
                } catch (error) {
                    return JSON.stringify({ error: `Failed to create task context: ${error.message}` });
                }
            }
        };
    }
}

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
                'Call this before creating a plan or todo list to check whether a task context already exists — ' +
                'if one exists and matches the current task, follow it instead of creating a new plan. ' +
                'Without a taskContextId, returns all task contexts created in this session or attached to the chat context (e.g. plans from previous sessions). ' +
                'If multiple are returned, identify the relevant ones by their titles, e.g. via listTaskContexts, and re-read a specific plan via its taskContextId. ' +
                'Always call this before acting on or editing the plan to ensure you have the latest version, ' +
                'as the user may have edited the plan directly in the editor.',
            parameters: {
                type: 'object',
                properties: {
                    taskContextId: {
                        type: 'string',
                        description: 'Optional task context ID. If not provided, returns all task contexts for the current session or attached to the chat context.'
                    }
                },
                required: []
            },
            handler: async (args: string, ctx?: ToolInvocationContext): Promise<string> => {
                assertChatContext(ctx);
                if (ctx.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }

                try {
                    const parsed = args ? JSON.parse(args) : {};
                    const taskContextId: string | undefined = parsed.taskContextId;

                    if (taskContextId) {
                        const summary = await findTaskContextSummary(this.storageService, ctx, taskContextId);
                        if (!summary) {
                            return 'No task context found for this session or attached to the chat context. Use createTaskContext to create one.';
                        }
                        return summary.summary;
                    }

                    const { sessionSummaries, attachedSummaries } = await collectTaskContextSummaries(this.storageService, ctx);
                    const allSummaries = [...sessionSummaries, ...attachedSummaries];
                    if (allSummaries.length === 0) {
                        return 'No task context found for this session or attached to the chat context. Use createTaskContext to create one.';
                    }
                    if (allSummaries.length === 1) {
                        return allSummaries[0].summary;
                    }
                    const sections = allSummaries.map((summary, index) => {
                        const attachedSuffix = attachedSummaries.includes(summary) ? ' [attached to chat context]' : '';
                        return `## Task ${index + 1}: "${summary.label}" (id: ${summary.id})${attachedSuffix}\n\n${summary.summary}`;
                    });
                    return `${allSummaries.length} task contexts are available. Identify the ones matching the current task by their titles; ` +
                        `pass a taskContextId to re-read a specific plan.\n\n${sections.join('\n\n')}`;
                } catch (error) {
                    return JSON.stringify({ error: `Failed to get task context: ${error.message}` });
                }
            }
        };
    }
}

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
            handler: async (args: string, ctx?: ToolInvocationContext): Promise<string> => {
                assertChatContext(ctx);
                if (ctx.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }

                try {
                    const { oldContent, newContent, taskContextId } = JSON.parse(args);

                    const summary = await findTaskContextSummary(this.storageService, ctx, taskContextId);

                    if (!summary) {
                        return 'No task context found for this session or attached to the chat context. Use createTaskContext to create one first.';
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

@injectable()
export class ListTaskContextsFunction implements ToolProvider {
    static ID = LIST_TASK_CONTEXTS_FUNCTION_ID;

    @inject(TaskContextStorageService)
    protected readonly storageService: TaskContextStorageService;

    getTool(): ToolRequest {
        return {
            id: ListTaskContextsFunction.ID,
            name: ListTaskContextsFunction.ID,
            description: 'List all task contexts (plans) for the current session, including task contexts attached to the chat context. ' +
                'Use this to see what plans exist and their IDs.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            },
            handler: async (args: string, ctx?: ToolInvocationContext): Promise<string> => {
                assertChatContext(ctx);
                if (ctx.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }

                try {
                    const { sessionSummaries, attachedSummaries } = await collectTaskContextSummaries(this.storageService, ctx);

                    if (sessionSummaries.length === 0 && attachedSummaries.length === 0) {
                        return 'No task contexts found for this session or attached to the chat context.';
                    }

                    const entries = [
                        ...sessionSummaries.map(s => ({ id: s.id, label: s.label, attached: false })),
                        ...attachedSummaries.map(s => ({ id: s.id, label: s.label, attached: true }))
                    ];
                    const list = entries.map((entry, i) =>
                        `${i + 1}. "${entry.label}" (id: ${entry.id})${entry.attached ? ' [attached to chat context]' : ''}`
                    ).join('\n');
                    const defaultEntry = sessionSummaries.length > 0 ? sessionSummaries[sessionSummaries.length - 1] : attachedSummaries[attachedSummaries.length - 1];

                    return `Task contexts available in this chat:\n${list}\n\nMost recent: "${defaultEntry.label}"`;
                } catch (error) {
                    return JSON.stringify({ error: `Failed to list task contexts: ${error.message}` });
                }
            }
        };
    }
}

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
            handler: async (args: string, ctx?: ToolInvocationContext): Promise<string> => {
                assertChatContext(ctx);
                if (ctx.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }

                try {
                    const { content, taskContextId } = JSON.parse(args);

                    const summary = await findTaskContextSummary(this.storageService, ctx, taskContextId);

                    if (!summary) {
                        return 'No task context found for this session or attached to the chat context. Use createTaskContext to create one first.';
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
