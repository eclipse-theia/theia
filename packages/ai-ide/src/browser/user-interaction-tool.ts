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
import { ToolInvocationContext } from '@theia/ai-core/lib/common/language-model';
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
    UserInteractionResult,
    UserInteractionStep,
    UserInteractionStepResult,
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
    UserInteractionStep,
    UserInteractionStepResult,
    UserInteractionResult,
    resolveContentRef,
    parseUserInteractionArgs,
    parseUserInteractionInput
} from '../common/user-interaction-tool';

interface PendingInteraction {
    deferred: Deferred<string>;
    steps: UserInteractionStep[];
    stepResults: UserInteractionStepResult[];
    resolved: boolean;
}

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

    protected readonly pendingInteractions = new Map<string, PendingInteraction>();

    getTool(): ToolRequest {
        const stepSchema = {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'A short title for this step.' },
                message: { type: 'string', description: 'A markdown-formatted message to present to the user.' },
                options: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            text: { type: 'string', description: 'Display text for the option button.' },
                            value: { type: 'string', description: 'Value returned when the user selects this option.' },
                            description: { type: 'string', description: 'Optional longer description shown with the option.' },
                            buttonLabel: { type: 'string', description: 'Optional prominent button label text. Falls back to text if not provided.' }
                        },
                        required: ['text', 'value']
                    },
                    description: 'Optional buttons offered to the user for this step. Omit for purely informational steps; '
                        + 'a hardcoded "Next"/"Finish" button is always shown to advance.'
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
                            label: { type: 'string', description: 'Optional label for the link or diff tab.' },
                            autoOpen: {
                                type: 'boolean',
                                description: 'Whether to automatically open the file/diff when this step becomes active. Defaults to true.'
                            }
                        },
                        required: ['ref']
                    },
                    description: 'Optional links to files or diffs to show alongside this step.'
                }
            },
            required: ['title', 'message']
        };

        return {
            id: UserInteractionTool.ID,
            name: UserInteractionTool.ID,
            description: 'Present an interactive multi-step wizard to the user. Each step has a title, a markdown message, optional option buttons, '
                + 'and optional file/diff links that auto-open when the step is reached. The user advances with a hardcoded "Next" button '
                + '(or "Finish" on the last step) and may add free-form comments on every step. The tool returns a JSON string with '
                + '{ "completed": boolean, "steps": [{ "title", "value"?, "comments"?, "skipped"? }] }. If the user cancels mid-wizard, '
                + 'the tool returns whatever has been collected so far with "completed": false. Use this to walk users through a series '
                + 'of pre-determined findings or decisions in a single tool call.',
            parameters: {
                type: 'object',
                properties: {
                    interactions: {
                        type: 'array',
                        items: stepSchema,
                        description: 'Ordered list of wizard steps. The user walks through them sequentially without a back button.'
                    }
                },
                required: ['interactions']
            },
            handler: (argString: string, ctx) => this.handleInteraction(argString, ctx)
        };
    }

    setStepResult(toolCallId: string, stepIndex: number, partial: Partial<UserInteractionStepResult>): void {
        const pending = this.pendingInteractions.get(toolCallId);
        if (!pending || pending.resolved) {
            return;
        }
        if (stepIndex < 0 || stepIndex >= pending.steps.length) {
            return;
        }
        const existing = pending.stepResults[stepIndex] ?? { title: pending.steps[stepIndex].title };
        pending.stepResults[stepIndex] = {
            ...existing,
            ...partial,
            title: pending.steps[stepIndex].title
        };
    }

    completeInteraction(toolCallId: string): void {
        const pending = this.pendingInteractions.get(toolCallId);
        if (!pending || pending.resolved) {
            return;
        }
        pending.resolved = true;
        const result: UserInteractionResult = {
            completed: true,
            steps: this.normalizeStepResults(pending)
        };
        pending.deferred.resolve(JSON.stringify(result));
    }

    cancelInteraction(toolCallId: string): void {
        const pending = this.pendingInteractions.get(toolCallId);
        if (!pending || pending.resolved) {
            return;
        }
        pending.resolved = true;
        const steps = this.normalizeStepResults(pending);
        // Mark steps without any user input as skipped.
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const hasInput = step.value !== undefined || (step.comments && step.comments.length > 0);
            if (!hasInput) {
                steps[i] = { ...step, skipped: true };
            }
        }
        const result: UserInteractionResult = { completed: false, steps };
        pending.deferred.resolve(JSON.stringify(result));
    }

    protected normalizeStepResults(pending: PendingInteraction): UserInteractionStepResult[] {
        return pending.steps.map((step, i) => pending.stepResults[i] ?? { title: step.title });
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
        let parsed: { interactions?: unknown };
        try {
            parsed = JSON.parse(argString);
        } catch {
            return JSON.stringify({ error: 'Invalid arguments' });
        }
        if (!Array.isArray(parsed.interactions) || parsed.interactions.length === 0) {
            return JSON.stringify({ error: 'No interactions provided' });
        }

        const toolCallId = ToolInvocationContext.getToolCallId(ctx);
        if (!toolCallId) {
            return JSON.stringify({ error: 'No tool call ID available' });
        }

        const steps = parsed.interactions as UserInteractionStep[];
        const pending: PendingInteraction = {
            deferred: new Deferred<string>(),
            steps,
            stepResults: new Array(steps.length),
            resolved: false
        };
        this.pendingInteractions.set(toolCallId, pending);

        const cancellationToken = ToolInvocationContext.getCancellationToken(ctx);
        const cancellationListener = cancellationToken?.onCancellationRequested(() => this.cancelInteraction(toolCallId));

        try {
            return await pending.deferred.promise;
        } finally {
            cancellationListener?.dispose();
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
}
