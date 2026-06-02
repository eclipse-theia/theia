// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentConversationSummaryDTO } from './qaap-agent-conversation-client';
import { isVpsTaskSummary } from './qaap-work-hub-surfaces';

/** Normalizes VPS/Linux and Windows paths for cache keys and cwd comparison. */
export function normalizeTranscriptWorkspacePath(path: string): string {
    let normalized = path.replace(/\\/g, '/');
    while (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
}

export interface ResolveTranscriptWorkspaceCwdInput {
    readonly summary: Pick<QaapAgentConversationSummaryDTO, 'cwd' | 'source'>;
    /** From {@link MobileProjectsService.getProjectCwd} — hub project URI / current workspace. */
    readonly projectCwd?: string;
    /** Clone path from {@link MobileProjectsService.prepareProjectCwd} when GitHub-only. */
    readonly preparedCwd?: string;
}

/**
 * Filesystem cwd for transcript Files/Terminal.
 *
 * - **VPS agent tasks:** `summary.cwd` is authoritative (agent runs on the server even when
 *   another folder is open in the IDE).
 * - **Local / hub project card:** project URI first, then prepared clone, then conversation cwd.
 */
export function resolveTranscriptWorkspaceCwd(input: ResolveTranscriptWorkspaceCwdInput): string | undefined {
    const fromSummary = input.summary.cwd?.trim();
    const fromProject = input.projectCwd?.trim();
    const fromPrepared = input.preparedCwd?.trim();

    if (isVpsTaskSummary(input.summary) && fromSummary) {
        return normalizeTranscriptWorkspacePath(fromSummary);
    }

    const chosen = fromProject ?? fromPrepared ?? fromSummary;
    return chosen ? normalizeTranscriptWorkspacePath(chosen) : undefined;
}
