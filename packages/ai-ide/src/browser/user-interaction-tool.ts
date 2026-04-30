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
    PathContentRef,
    UserInteractionLink,
    UserInteractionResult,
    UserInteractionStep,
    UserInteractionStepResult,
    buildDiffLabel,
    isEmptyContentRef,
    parseUserInteractionArgs,
    resolveContentRef
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
        const contentRefSchema = {
            oneOf: [
                {
                    type: 'string',
                    description: 'Workspace-relative file path. Shorthand for { "path": "..." }.'
                },
                {
                    type: 'object',
                    properties: {
                        path: {
                            type: 'string',
                            description: 'Workspace-relative file path. Required unless "empty" is true.'
                        },
                        gitRef: {
                            type: 'string',
                            description: 'Optional git ref (branch, tag, or commit hash). Ignored when "empty" is true.'
                        },
                        line: {
                            type: 'number',
                            description: 'Optional 1-based line number to scroll to. Ignored when "empty" is true.'
                        },
                        empty: {
                            type: 'boolean',
                            description: 'Set to true to mark this side as intentionally empty (e.g., for newly added or deleted files in a diff).'
                        },
                        label: {
                            type: 'string',
                            description: 'Optional label for an empty side (e.g., "new file", "deleted"). Only used when "empty" is true.'
                        }
                    }
                }
            ],
            description: 'Content reference. Provide "path" for a real file (optionally with "gitRef" and/or "line"), '
                + 'a plain string as shorthand for a workspace-relative path, '
                + 'or set "empty": true to represent a missing side of a diff.'
        };
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
                                ...contentRefSchema,
                                description: 'Content reference for the file (or left side of a diff). '
                                    + 'Provide "path" for a real file, or "empty": true for files that did not exist.'
                            },
                            rightRef: {
                                ...contentRefSchema,
                                description: 'Optional right-side content reference for diff views. '
                                    + 'Provide "path" for a real file, or "empty": true for files that no longer exist.'
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
            providerName: 'ai-ide',
            description: 'Present an interactive interaction to the user. Each step has a title, a markdown message, optional option buttons, '
                + 'and optional file/diff links that auto-open when the step is reached. '
                + 'Single-step behavior: a single-step interaction with options waits for the user to pick one option, which immediately completes the interaction; '
                + 'a single-step interaction without options is purely informational and is auto-completed by the tool '
                + '(do not promise the user a "Finish" or "Next" button — there is none, and no comments can be entered). '
                + 'Multi-step behavior: the user advances through steps with a "Next" button (or "Finish" on the last step), can navigate freely between steps, '
                + 'and may add free-form comments on every step. '
                + 'The tool returns a JSON string with { "completed": boolean, "steps": [{ "title", "value"?, "comments"?, "skipped"? }] }. '
                + 'If the user cancels mid-interaction, the tool returns whatever has been collected so far with "completed": false. '
                + 'Use this to walk users through a series of pre-determined findings or decisions in a single tool call, '
                + 'or to surface a single message/diff that should be shown inline in the chat.',
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

    /**
     * Set the result for a step and immediately complete the interaction.
     * Use this to atomically pass the user's input value into the result, avoiding
     * any reliance on synchronous state updates between `setStepResult` and `completeInteraction`.
     */
    completeInteractionWith(toolCallId: string, stepIndex: number, partial: Partial<UserInteractionStepResult>): void {
        this.setStepResult(toolCallId, stepIndex, partial);
        this.completeInteraction(toolCallId);
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
            const diffLabel = link.label || buildDiffLabel(left, right);
            const diffUri = DiffUris.encode(resolvedLeftUri, resolvedRightUri, diffLabel);
            // Prefer the right-side line (working copy) since diff editors reveal
            // selections on the modified editor; fall back to the left-side line.
            const line = (!isEmptyContentRef(right) && right.line)
                || (!isEmptyContentRef(left) && left.line)
                || undefined;
            const selection = line ? { start: { line: line - 1, character: 0 } } : undefined;
            await open(this.openerService, diffUri, { selection });
        } else {
            if (isEmptyContentRef(link.ref)) {
                return;
            }
            const left = resolveContentRef(link.ref) as PathContentRef;
            if (left.gitRef) {
                const uri = this.resolveUri(left, workspaceRoot);
                let targetUri: URI;
                if (uri === undefined) {
                    targetUri = this.errorContentUri(left.path, left.gitRef);
                } else if (await this.canResolveUri(uri)) {
                    targetUri = uri;
                } else {
                    // SCM is available but reading at this ref failed — likely the
                    // ref does not exist or the file did not exist at that ref.
                    targetUri = this.refNotFoundUri(left.path, left.gitRef);
                }
                await open(this.openerService, targetUri);
            } else {
                const fileUri = workspaceRoot.resolve(left.path);
                this.workspaceScope.ensureWithinWorkspace(fileUri, workspaceRoot);
                if (!(await this.canResolveUri(fileUri))) {
                    await open(this.openerService, this.fileNotFoundUri(left.path));
                    return;
                }
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

    protected async handleInteraction(argString: string, ctx: ToolInvocationContext | undefined): Promise<string> {
        try {
            JSON.parse(argString);
        } catch {
            return JSON.stringify({ error: 'Invalid arguments' });
        }
        // Validate via the shared parser so the tool only ever waits for steps that
        // the renderer would actually render. Otherwise the agent could send a
        // step the UI filters out, leaving the tool blocked on input forever.
        const validated = parseUserInteractionArgs(argString);
        if (!validated || validated.interactions.length === 0) {
            return JSON.stringify({ error: 'No interactions provided' });
        }

        const toolCallId = ToolInvocationContext.getToolCallId(ctx);
        if (!toolCallId) {
            return JSON.stringify({ error: 'No tool call ID available' });
        }

        const steps: UserInteractionStep[] = validated.interactions;

        // Single-step interactions without options are purely informational
        // (message + optional links/diffs) and should not block the agent.
        // Resolve immediately with completed=true.
        if (steps.length === 1 && (!steps[0].options || steps[0].options.length === 0)) {
            const result: UserInteractionResult = {
                completed: true,
                steps: [{ title: steps[0].title }]
            };
            return JSON.stringify(result);
        }

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
            // No SCM provider could resolve the gitRef — surface as an actionable error.
            return this.errorContentUri(resolved.path, resolved.gitRef!);
        }
        if (await this.canResolveUri(uri)) {
            return uri;
        }
        // SCM resolved the URI but reading content failed — most commonly the file
        // simply did not exist at that revision (e.g. newly added file). Show empty.
        return this.emptyContentUri(resolved.path);
    }

    protected errorContentUri(path: string, gitRef: string): URI {
        const message = `Unable to resolve revision '${gitRef}' for '${path}'.\n\n`
            + 'No SCM provider is available to retrieve this revision. '
            + 'Ensure the Git extension is active and the repository is recognized.';
        return new URI().withScheme(MEMORY_TEXT_READONLY).withPath(path).withQuery(message);
    }

    protected refNotFoundUri(path: string, gitRef: string): URI {
        const message = `Could not load '${path}' at revision '${gitRef}'.\n\n`
            + 'The revision may not exist, or the file did not exist at that revision.';
        return new URI().withScheme(MEMORY_TEXT_READONLY).withPath(path).withQuery(message);
    }

    protected fileNotFoundUri(path: string): URI {
        const message = `Could not load '${path}'.\n\nThe file does not exist in the current workspace.`;
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
