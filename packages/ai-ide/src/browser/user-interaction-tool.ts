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

import { ToolProvider, ToolRequest } from '@theia/ai-core';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { open, OpenerService } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { EditorManager } from '@theia/editor/lib/browser';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { WorkspaceFunctionScope } from './workspace-functions';
import {
    USER_INTERACTION_FUNCTION_ID,
    UserInteractionLink,
    resolveContentRef
} from '../common/user-interaction-tool';

export {
    USER_INTERACTION_FUNCTION_ID,
    ContentRef,
    UserInteractionLink,
    UserInteractionOption,
    UserInteractionArgs,
    UserInteractionInput,
    resolveContentRef,
    parseUserInteractionArgs,
    parseUserInteractionInput
} from '../common/user-interaction-tool';

@injectable()
export class UserInteractionTool implements ToolProvider {
    static ID = USER_INTERACTION_FUNCTION_ID;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(ScmService)
    protected readonly scmService: ScmService;

    @inject(WorkspaceFunctionScope)
    protected readonly workspaceScope: WorkspaceFunctionScope;

    protected readonly pendingInteractions = new Map<string, Deferred<string>>();

    getTool(): ToolRequest {
        return {
            id: UserInteractionTool.ID,
            name: UserInteractionTool.ID,
            description: 'Present an interactive question to the user with a title, markdown message, option buttons, and optional file or diff links. '
                + 'The user sees the rendered content in the chat and clicks an option button. '
                + 'The tool returns the value of the option the user selected. '
                + 'Use this whenever you need the user to make a choice before proceeding.',
            parameters: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: 'A short title for the interaction.'
                    },
                    message: {
                        type: 'string',
                        description: 'A markdown-formatted message to present to the user.'
                    },
                    options: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                text: {
                                    type: 'string',
                                    description: 'Display text for the option button.'
                                },
                                value: {
                                    type: 'string',
                                    description: 'Value returned when the user selects this option.'
                                },
                                description: {
                                    type: 'string',
                                    description: 'Optional longer description shown with the option.'
                                },
                                buttonLabel: {
                                    type: 'string',
                                    description: 'Optional prominent button label text. Falls back to text if not provided.'
                                }
                            },
                            required: ['text', 'value']
                        },
                        description: 'Array of options the user can choose from.'
                    },
                    links: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                ref: {
                                    oneOf: [
                                        { type: 'string', description: 'Workspace-relative file path.' },
                                        {
                                            type: 'object',
                                            properties: {
                                                path: { type: 'string', description: 'Workspace-relative file path.' },
                                                gitRef: { type: 'string', description: 'Optional git ref (branch, tag, or commit hash).' },
                                                line: { type: 'number', description: 'Optional 1-based line number to scroll to.' }
                                            },
                                            required: ['path']
                                        }
                                    ],
                                    description: 'Content reference for the file (or left side of a diff).'
                                },
                                rightRef: {
                                    oneOf: [
                                        { type: 'string', description: 'Workspace-relative file path.' },
                                        {
                                            type: 'object',
                                            properties: {
                                                path: { type: 'string', description: 'Workspace-relative file path.' },
                                                gitRef: { type: 'string', description: 'Optional git ref (branch, tag, or commit hash).' },
                                                line: { type: 'number', description: 'Optional 1-based line number to scroll to.' }
                                            },
                                            required: ['path']
                                        }
                                    ],
                                    description: 'Optional right-side content reference for diff views.'
                                },
                                label: {
                                    type: 'string',
                                    description: 'Optional label for the link or diff tab.'
                                },
                                autoOpen: {
                                    type: 'boolean',
                                    description: 'Whether to automatically open the file/diff when the tool is called. Defaults to true.'
                                }
                            },
                            required: ['ref']
                        },
                        description: 'Optional array of links to files or diffs to show alongside the interaction.'
                    }
                },
                required: ['title', 'message', 'options']
            },
            handler: (argString: string, ctx) => this.handleInteraction(argString, ctx)
        };
    }

    resolveInteraction(toolCallId: string, value: string): void {
        const deferred = this.pendingInteractions.get(toolCallId);
        if (deferred) {
            deferred.resolve(value);
            this.pendingInteractions.delete(toolCallId);
        }
    }

    async openLink(link: UserInteractionLink): Promise<void> {
        const workspaceRoot = await this.workspaceScope.getWorkspaceRoot();
        const left = resolveContentRef(link.ref);

        if (link.rightRef !== undefined) {
            const right = resolveContentRef(link.rightRef);
            const leftUri = this.resolveUri(left, workspaceRoot);
            const rightUri = this.resolveUri(right, workspaceRoot);
            const diffLabel = link.label || this.buildDiffLabel(left, right);
            const diffUri = DiffUris.encode(leftUri, rightUri, diffLabel);
            await open(this.openerService, diffUri);
        } else {
            if (left.gitRef) {
                const uri = this.resolveUri(left, workspaceRoot);
                await open(this.openerService, uri);
            } else {
                const fileUri = workspaceRoot.resolve(left.path);
                this.workspaceScope.ensureWithinWorkspace(fileUri, workspaceRoot);
                const selection = left.line
                    ? { start: { line: left.line - 1, character: 0 } }
                    : undefined;
                await this.editorManager.open(fileUri, { selection });
            }
        }
    }

    protected resolveUri(
        ref: { path: string; gitRef?: string; line?: number },
        workspaceRoot: URI
    ): URI {
        const fileUri = workspaceRoot.resolve(ref.path);
        this.workspaceScope.ensureWithinWorkspace(fileUri, workspaceRoot);

        if (ref.gitRef) {
            const repo = this.scmService.selectedRepository;
            if (repo) {
                const query = { path: fileUri['codeUri'].fsPath, ref: ref.gitRef };
                return fileUri.withScheme(repo.provider.id).withQuery(JSON.stringify(query));
            }
        }
        return fileUri;
    }

    protected buildDiffLabel(
        left: { path: string; gitRef?: string },
        right: { path: string; gitRef?: string }
    ): string {
        if (left.path === right.path) {
            const leftLabel = left.gitRef ? left.gitRef.substring(0, 8) : 'Working Copy';
            const rightLabel = right.gitRef ? right.gitRef.substring(0, 8) : 'Working Copy';
            return `${left.path} (${leftLabel} ⟷ ${rightLabel})`;
        }
        return `${left.path} ⟷ ${right.path}`;
    }

    protected async handleInteraction(argString: string, ctx: unknown): Promise<string> {
        const args = JSON.parse(argString);

        const toolCallId = this.getToolCallId(ctx);
        if (!toolCallId) {
            return JSON.stringify({ error: 'No tool call ID available' });
        }

        // Normalize links: support both singular "link" and plural "links"
        const links: UserInteractionLink[] = Array.isArray(args.links)
            ? args.links
            : args.link ? [args.link] : [];

        for (const link of links) {
            if (link.autoOpen !== false) {
                try {
                    await this.openLink(link);
                } catch {
                    // Link opening is best-effort; don't fail the interaction
                }
            }
        }

        const deferred = new Deferred<string>();
        this.pendingInteractions.set(toolCallId, deferred);

        try {
            const selectedValue = await deferred.promise;
            return selectedValue;
        } finally {
            this.pendingInteractions.delete(toolCallId);
        }
    }

    protected getToolCallId(ctx: unknown): string | undefined {
        if (ctx && typeof ctx === 'object' && 'toolCallId' in ctx && typeof (ctx as Record<string, unknown>).toolCallId === 'string') {
            return (ctx as Record<string, unknown>).toolCallId as string;
        }
        return undefined;
    }
}
