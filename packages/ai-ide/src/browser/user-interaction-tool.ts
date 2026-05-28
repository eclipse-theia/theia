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

import { ToolProvider, ToolRequest, ToolRequestParameterProperty, ToolRequestParameters } from '@theia/ai-core';
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
    buildDiffLabel,
    isEmptyContentRef,
    normalizeUserInteractionLink,
    parseUserInteractionArgs,
    resolveContentRef
} from '../common/user-interaction-tool';

interface PendingInteraction {
    deferred: Deferred<string>;
    steps: UserInteractionStep[];
    resolved: boolean;
    /**
     * Latest partial result pushed by the renderer via {@link UserInteractionTool.recordPartial}.
     * Used to resolve the handler with what the user has collected so far when the interaction
     * is canceled. If absent (no renderer mounted) the tool resolves with all steps skipped.
     */
    latestPartial?: UserInteractionResult;
}

// Schemas are module-level constants so they are built once at load time
// rather than reconstructed on every getTool() call. We use a single object
// schema (no oneOf/anyOf) since some providers (notably OpenAI) handle union
// types poorly. The runtime parser additionally accepts plain string paths
// as shorthand.
const CONTENT_REF_SCHEMA: ToolRequestParameterProperty = {
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
    },
    description: 'Content reference. Provide "path" for a real file (optionally with "gitRef" and/or "line"), '
        + 'or set "empty": true to represent a missing side of a diff.'
};

const STEP_SCHEMA: ToolRequestParameterProperty = {
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
                        ...CONTENT_REF_SCHEMA,
                        description: 'Content reference for the file (or left side of a diff). '
                            + 'Provide "path" for a real file, or "empty": true for files that did not exist.'
                    },
                    rightRef: {
                        ...CONTENT_REF_SCHEMA,
                        description: 'Right-side content reference for a diff view. '
                            + 'Only provide this when the step should show a diff; omit it entirely for a single file link. '
                            + 'Provide "path" for a real file, or "empty": true for files that no longer exist.'
                    },
                    label: { type: 'string', description: 'Optional label for the link or diff tab.' },
                    autoOpen: {
                        type: 'boolean',
                        description: 'Whether to automatically open the file/diff when this step becomes active. Defaults to false; '
                            + 'set to true only when the link is essential context the user must see immediately.'
                    }
                },
                required: ['ref']
            },
            description: 'Optional links to files or diffs to show alongside this step. '
                + 'Use "ref" alone for a single file link. Add "rightRef" only when the step should show a diff.'
        }
    },
    required: ['title', 'message']
};

const TOOL_PARAMETERS: ToolRequestParameters = {
    type: 'object',
    properties: {
        interactions: {
            type: 'array',
            items: STEP_SCHEMA,
            description: 'Ordered list of interaction steps. The user walks through them sequentially and can revisit previous steps.'
        }
    },
    required: ['interactions']
};

const TOOL_DESCRIPTION = 'Present an interactive user interaction. Each step has a title, a markdown message, optional option buttons, '
    + 'and optional file/diff links that the user can click. '
    + 'For links, use "ref" alone to show one file; add "rightRef" only when the step should show a diff. '
    + 'Single-step behavior: if the step has options, the tool waits for the user to pick one option and then completes the interaction; '
    + 'if the step has no options, it is purely informational and is auto-completed by the tool '
    + '(do not promise the user a "Finish" or "Next" button; there is none, and no comments can be entered). '
    + 'Multi-step behavior: the user advances through steps with a "Next" button (or "Finish" on the last step), can revisit previous steps, '
    + 'and may add free-form comments on every step. '
    + 'The tool returns a JSON string with { "completed": boolean, "steps": [{ "title", "value"?, "comments"?, "skipped"? }] }. '
    + 'If the user cancels mid-interaction, the tool returns whatever has been collected so far with "completed": false. '
    + 'Use this to walk users through a series of pre-determined findings or decisions in a single tool call, '
    + 'or to surface a single message/diff that should be shown inline in the chat.';

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
        return {
            id: UserInteractionTool.ID,
            name: UserInteractionTool.ID,
            providerName: 'ai-ide',
            description: TOOL_DESCRIPTION,
            parameters: TOOL_PARAMETERS,
            handler: (argString: string, ctx) => this.handleInteraction(argString, ctx)
        };
    }

    /**
     * Resolve the pending interaction with the given final result. The renderer is the single
     * source of truth for the collected user input and passes the full result here on Finish
     * (or on a per-option click for single-step interactions).
     */
    completeInteraction(toolCallId: string, result: UserInteractionResult): void {
        this.resolveInteraction(toolCallId, result);
    }

    /**
     * Push the latest partial result so the tool can resolve with it on cancellation.
     * The renderer should call this whenever the user changes step state. Calls for
     * an already-resolved interaction are silently ignored.
     */
    recordPartial(toolCallId: string, partial: UserInteractionResult): void {
        const pending = this.pendingInteractions.get(toolCallId);
        if (!pending || pending.resolved) {
            return;
        }
        pending.latestPartial = partial;
    }

    protected resolveInteraction(toolCallId: string, result: UserInteractionResult): void {
        const pending = this.pendingInteractions.get(toolCallId);
        if (!pending || pending.resolved) {
            return;
        }
        pending.resolved = true;
        pending.deferred.resolve(JSON.stringify(result));
    }

    protected cancelPending(toolCallId: string): void {
        const pending = this.pendingInteractions.get(toolCallId);
        if (!pending || pending.resolved) {
            return;
        }
        const result = pending.latestPartial ?? {
            completed: false,
            steps: pending.steps.map(step => ({ title: step.title, skipped: true }))
        };
        this.resolveInteraction(toolCallId, result);
    }

    async openLink(link: UserInteractionLink): Promise<void> {
        const normalizedLink = normalizeUserInteractionLink(link);
        if (!normalizedLink) {
            return;
        }
        link = normalizedLink;

        if (link.rightRef !== undefined) {
            const resolvedLeftUri = await this.resolveDiffSideUri(link.ref);
            const resolvedRightUri = await this.resolveDiffSideUri(link.rightRef);
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
                const uri = this.resolveUri(left);
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
                const fileUri = this.workspaceScope.resolveRelativePath(left.path);
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
        ref: PathContentRef
    ): URI | undefined {
        const fileUri = this.workspaceScope.resolveRelativePath(ref.path);
        if (ref.gitRef) {
            const repo = this.scmService.findRepository(fileUri);
            if (repo) {
                return repo.toUriAtRef(fileUri, ref.gitRef);
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
            resolved: false
        };
        this.pendingInteractions.set(toolCallId, pending);

        const cancellationToken = ToolInvocationContext.getCancellationToken(ctx);
        const cancellationListener = cancellationToken?.onCancellationRequested(() => this.cancelPending(toolCallId));

        try {
            return await pending.deferred.promise;
        } finally {
            cancellationListener?.dispose();
            this.pendingInteractions.delete(toolCallId);
        }
    }

    protected async resolveDiffSideUri(ref: ContentRef): Promise<URI> {
        if (isEmptyContentRef(ref)) {
            return this.emptyContentUri(ref.label || '');
        }
        const resolved = resolveContentRef(ref) as PathContentRef;
        const uri = this.resolveUri(resolved);
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
