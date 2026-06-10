// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, optional } from '@theia/core/shared/inversify';
import { generateUuid } from '@theia/core/lib/common/uuid';
import {
    FrontendLanguageModelRegistry,
    LanguageModelService,
    getTextOfResponse,
    type LanguageModel,
} from '@theia/ai-core/lib/common';
import {
    QAAP_GIT_REVIEW_API_PATH,
    type QaapGitChangedFile,
    type QaapGitCommitContextResponse,
} from '../common/qaap-git-review';

/** Model aliases tried in order; the first one with a ready model wins. */
const COMMIT_MESSAGE_MODEL_ALIASES = ['default/summarize', 'default/universal', 'default/code'] as const;

/** Logical agent id recorded against the language-model session. */
const COMMIT_MESSAGE_AGENT_ID = 'qaap-commit-message';

export interface QaapGeneratedCommitInfo {
    /** Commit message subject line. */
    message: string;
    /** Branch name suggestion derived from the message (Cursor-style `qaap/<slug>-<suffix>`). */
    branchName: string;
    /** True when the message came from a language model (vs the heuristic fallback). */
    ai: boolean;
}

/** Derive a `qaap/<slug>-<suffix>` branch name from a commit message. */
export function commitMessageToBranchName(message: string): string {
    const slug = message
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .split('-')
        .filter(Boolean)
        .slice(0, 6)
        .join('-')
        .slice(0, 40)
        .replace(/-+$/, '');
    const suffix = Math.random().toString(36).slice(2, 6);
    return `qaap/${slug || 'changes'}-${suffix}`;
}

/** Deterministic commit message from the changed-file list, used when no language model is ready. */
export function heuristicCommitMessage(files: readonly QaapGitChangedFile[]): string {
    if (files.length === 0) {
        return 'Update workspace files';
    }
    const verbFor = (status: string): string => {
        if (status === 'U' || status === 'A' || status === '?') {
            return 'Add';
        }
        if (status === 'D') {
            return 'Remove';
        }
        return 'Update';
    };
    if (files.length === 1) {
        return `${verbFor(files[0].status)} ${files[0].path}`;
    }
    const names = files.slice(0, 3).map(file => file.path.split('/').pop() ?? file.path);
    const rest = files.length - names.length;
    return rest > 0
        ? `Update ${names.join(', ')} and ${rest} more file${rest === 1 ? '' : 's'}`
        : `Update ${names.join(', ')}`;
}

/** Strip code fences / quotes and reduce the model output to a single subject line. */
export function sanitizeGeneratedCommitMessage(raw: string): string {
    const withoutFences = raw.replace(/```[a-z]*\n?/gi, '').trim();
    const firstLine = withoutFences.split('\n').map(line => line.trim()).find(Boolean) ?? '';
    return firstLine.replace(/^["'`]+|["'`]+$/g, '').slice(0, 120).trim();
}

/**
 * Generates commit messages automatically from the working-tree diff, Cursor-agents style:
 * fetches the diff from the git-review endpoint and asks the configured language model for a
 * one-line message. Falls back to a heuristic message when no model is ready or the request fails.
 */
@injectable()
export class QaapCommitMessageAi {

    @inject(FrontendLanguageModelRegistry) @optional()
    protected readonly languageModelRegistry?: FrontendLanguageModelRegistry;

    @inject(LanguageModelService) @optional()
    protected readonly languageModelService?: LanguageModelService;

    /** Generate a commit message (and branch-name suggestion) for the repository at `root`. */
    async generate(root: string): Promise<QaapGeneratedCommitInfo> {
        const context = await this.fetchCommitContext(root);
        const fallback = heuristicCommitMessage(context?.files ?? []);
        let message = fallback;
        let ai = false;
        if (context && (context.diff.trim() || context.files.length > 0)) {
            const generated = await this.generateWithModel(context);
            if (generated) {
                message = generated;
                ai = true;
            }
        }
        return { message, branchName: commitMessageToBranchName(message), ai };
    }

    protected async fetchCommitContext(root: string): Promise<QaapGitCommitContextResponse | undefined> {
        try {
            const response = await fetch(
                `${QAAP_GIT_REVIEW_API_PATH}/commit-context?root=${encodeURIComponent(root)}`,
                { credentials: 'include' },
            );
            if (!response.ok) {
                return undefined;
            }
            return await response.json() as QaapGitCommitContextResponse;
        } catch {
            return undefined;
        }
    }

    protected async generateWithModel(context: QaapGitCommitContextResponse): Promise<string | undefined> {
        const model = await this.pickModel();
        if (!model || !this.languageModelService) {
            return undefined;
        }
        try {
            const response = await this.languageModelService.sendRequest(model, {
                messages: [{ actor: 'user', type: 'text', text: this.buildPrompt(context) }],
                sessionId: generateUuid(),
                requestId: generateUuid(),
                agentId: COMMIT_MESSAGE_AGENT_ID,
            });
            const message = sanitizeGeneratedCommitMessage(await getTextOfResponse(response));
            return message || undefined;
        } catch {
            return undefined;
        }
    }

    protected async pickModel(): Promise<LanguageModel | undefined> {
        if (!this.languageModelRegistry) {
            return undefined;
        }
        for (const alias of COMMIT_MESSAGE_MODEL_ALIASES) {
            try {
                const model = await this.languageModelRegistry.getReadyLanguageModel(alias);
                if (model) {
                    return model;
                }
            } catch {
                // Try the next alias.
            }
        }
        return undefined;
    }

    protected buildPrompt(context: QaapGitCommitContextResponse): string {
        const fileList = context.files
            .map(file => `${file.status} ${file.path} (+${file.adds} -${file.dels})`)
            .join('\n');
        return [
            'Write a git commit message for the changes below.',
            'Rules:',
            '- Respond with ONLY the commit message text: a single line, max 72 characters.',
            '- Use the imperative mood (e.g. "Add", "Fix", "Update").',
            '- No quotes, no code fences, no trailing period, no explanations.',
            '',
            context.branch ? `Current branch: ${context.branch}` : '',
            'Changed files:',
            fileList || '(none reported)',
            '',
            'Diff' + (context.truncated ? ' (truncated)' : '') + ':',
            context.diff || '(no textual diff available)',
        ].filter(Boolean).join('\n');
    }
}
