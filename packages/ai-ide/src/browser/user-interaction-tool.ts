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
import { MEMORY_TEXT, MEMORY_TEXT_READONLY, ResourceProvider } from '@theia/core/lib/common/resource';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { EditorManager } from '@theia/editor/lib/browser';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { WorkspaceFunctionScope } from './workspace-functions';
import {
    ContentRef,
    USER_INTERACTION_FUNCTION_ID,
    EmptyContentRef,
    PathContentRef,
    UserInteractionLink,
    isEmptyContentRef,
    resolveContentRef
} from '../common/user-interaction-tool';

export {
    USER_INTERACTION_FUNCTION_ID,
    ContentRef,
    EmptyContentRef,
    PathContentRef,
    isEmptyContentRef,
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

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;

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
                                        },
                                        {
                                            type: 'object',
                                            properties: {
                                                empty: { type: 'boolean', const: true },
                                                label: { type: 'string', description: 'Optional label for the empty side (e.g., "new file", "deleted").' }
                                            },
                                            required: ['empty'],
                                            description: 'Marks this side as intentionally empty (e.g., for newly added or deleted files).'
                                        }
                                    ],
                                    description: 'Content reference for the file (or left side of a diff). Use { "empty": true } for files that did not exist.'
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
                                        },
                                        {
                                            type: 'object',
                                            properties: {
                                                empty: { type: 'boolean', const: true },
                                                label: { type: 'string', description: 'Optional label for the empty side (e.g., "new file", "deleted").' }
                                            },
                                            required: ['empty'],
                                            description: 'Marks this side as intentionally empty (e.g., for newly added or deleted files).'
                                        }
                                    ],
                                    description: 'Optional right-side content reference for diff views. Use { "empty": true } for files that no longer exist.'
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

        if (link.rightRef !== undefined) {
            const resolvedLeftUri = await this.resolveDiffSideUri(link.ref, workspaceRoot);
            const resolvedRightUri = await this.resolveDiffSideUri(link.rightRef, workspaceRoot);
            const left = resolveContentRef(link.ref);
            const right = resolveContentRef(link.rightRef);
            const diffLabel = link.label || this.buildDiffLabel(left, right);
            const diffUri = DiffUris.encode(resolvedLeftUri, resolvedRightUri, diffLabel);
            await open(this.openerService, diffUri);
        } else {
            if (isEmptyContentRef(link.ref)) {
                return;
            }
            const left = resolveContentRef(link.ref) as PathContentRef;
            if (left.gitRef) {
                const uri = this.resolveUri(left, workspaceRoot);
                if (uri) {
                    await open(this.openerService, uri);
                }
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
        ref: PathContentRef,
        workspaceRoot: URI
    ): URI | undefined {
        const fileUri = workspaceRoot.resolve(ref.path);
        this.workspaceScope.ensureWithinWorkspace(fileUri, workspaceRoot);
        if (ref.gitRef) {
            const repo = this.scmService.findRepository(fileUri);
            if (repo) {
                const query = { path: fileUri['codeUri'].fsPath, ref: ref.gitRef };
                return fileUri.withScheme(repo.provider.id).withQuery(JSON.stringify(query));
            }
            console.warn(`No SCM repository found to resolve gitRef '${ref.gitRef}' for '${ref.path}'`);
            return undefined;
        }
        return fileUri;
    }

    protected buildDiffLabel(
        left: PathContentRef | EmptyContentRef,
        right: PathContentRef | EmptyContentRef
    ): string {
        const leftIsEmpty = isEmptyContentRef(left);
        const rightIsEmpty = isEmptyContentRef(right);
        if (leftIsEmpty && rightIsEmpty) {
            return `${left.label || 'Empty'} ⟷ ${right.label || 'Empty'}`;
        }
        if (leftIsEmpty) {
            const rightRef = right as PathContentRef;
            const rightTag = rightRef.gitRef ? rightRef.gitRef.substring(0, 8) : 'Working Copy';
            return `${rightRef.path} (${left.label || 'Empty'} ⟷ ${rightTag})`;
        }
        if (rightIsEmpty) {
            const leftRef = left as PathContentRef;
            const leftTag = leftRef.gitRef ? leftRef.gitRef.substring(0, 8) : 'Working Copy';
            return `${leftRef.path} (${leftTag} ⟷ ${right.label || 'Empty'})`;
        }
        const l = left as PathContentRef;
        const r = right as PathContentRef;
        if (l.path === r.path) {
            const leftTag = l.gitRef ? l.gitRef.substring(0, 8) : 'Working Copy';
            const rightTag = r.gitRef ? r.gitRef.substring(0, 8) : 'Working Copy';
            return `${l.path} (${leftTag} ⟷ ${rightTag})`;
        }
        return `${l.path} ⟷ ${r.path}`;
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

    protected async resolveDiffSideUri(ref: ContentRef, workspaceRoot: URI): Promise<URI> {
        if (isEmptyContentRef(ref)) {
            return this.emptyContentUri(ref.label || '');
        }
        const resolved = resolveContentRef(ref) as PathContentRef;
        const uri = this.resolveUri(resolved, workspaceRoot);
        if (uri === undefined) {
            return this.errorContentUri(resolved.path, resolved.gitRef!);
        }
        if (await this.canResolveUri(uri)) {
            return uri;
        }
        if (resolved.gitRef) {
            return this.errorContentUri(resolved.path, resolved.gitRef);
        }
        return this.emptyContentUri(resolved.path);
    }

    protected errorContentUri(path: string, gitRef: string): URI {
        const message = `Unable to resolve revision '${gitRef}' for '${path}'.\n\n`
            + 'The SCM provider could not retrieve this revision. '
            + 'Ensure the Git extension is active and the repository is recognized.';
        return new URI().withScheme(MEMORY_TEXT_READONLY).withPath(path).withQuery(message);
    }

    protected emptyContentUri(path: string): URI {
        return new URI().withScheme(MEMORY_TEXT).withPath(path);
    }

    protected async canResolveUri(uri: URI): Promise<boolean> {
        try {
            const resource = await this.resourceProvider(uri);
            try {
                await resource.readContents();
                return true;
            } catch {
                return false;
            } finally {
                resource.dispose();
            }
        } catch {
            return false;
        }
    }

    protected getToolCallId(ctx: unknown): string | undefined {
        if (ctx && typeof ctx === 'object' && 'toolCallId' in ctx && typeof (ctx as Record<string, unknown>).toolCallId === 'string') {
            return (ctx as Record<string, unknown>).toolCallId as string;
        }
        return undefined;
    }
}
