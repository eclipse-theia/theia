// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ChatMode } from '@theia/ai-chat/lib/common/chat-agents';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { nls } from '@theia/core/lib/common/nls';
import { hashString } from './qaap-agent-task-client';

const SELECTED_MODE_STORAGE_KEY = 'qaap.mobile.projects.selectedMode';

/** QAIQ interaction modes — Agent executes; Plan drafts only; Ask is read-only. */
export const QAAP_BACKEND_INTERACTION_MODES: readonly ChatMode[] = [
    {
        id: 'agent',
        name: nls.localize('qaap/mobileProjects/modeAgent', 'Agent'),
        isDefault: true,
    },
    {
        id: 'plan',
        name: nls.localize('qaap/mobileProjects/modePlan', 'Plan'),
    },
    {
        id: 'ask',
        name: nls.localize('qaap/mobileProjects/modeAsk', 'Ask'),
    },
];

export type QaapComposerInteractionModeId = 'agent' | 'plan' | 'ask';

export function scopedModeStorageKey(cwd: string): string {
    return `${SELECTED_MODE_STORAGE_KEY}.${hashString(cwd)}`;
}

export function readStoredComposerMode(cwd: string | undefined): string | undefined {
    if (!cwd) {
        return undefined;
    }
    try {
        return window.localStorage.getItem(scopedModeStorageKey(cwd)) ?? undefined;
    } catch {
        return undefined;
    }
}

export function writeStoredComposerMode(cwd: string | undefined, modeId: string): void {
    if (!cwd) {
        return;
    }
    try {
        window.localStorage.setItem(scopedModeStorageKey(cwd), modeId);
    } catch {
        /* session-only */
    }
}

export function defaultComposerModeId(modes: readonly ChatMode[]): string {
    return modes.find(mode => mode.isDefault)?.id ?? modes[0]?.id ?? 'agent';
}

export function resolveComposerModeLabel(modes: readonly ChatMode[], modeId: string | undefined): string {
    const resolved = modes.find(mode => mode.id === modeId);
    return resolved?.name ?? modes[0]?.name ?? modeId ?? '';
}

export function reconcileComposerModeId(
    current: string | undefined,
    modes: readonly ChatMode[],
    cwd: string | undefined,
): string {
    const ids = new Set(modes.map(mode => mode.id));
    if (current && ids.has(current)) {
        return current;
    }
    const stored = readStoredComposerMode(cwd);
    if (stored && ids.has(stored)) {
        return stored;
    }
    return defaultComposerModeId(modes);
}

/** Modes shown in the Qaap mobile composer — always QAIQ product modes. */
export function resolveStickyComposerModes(
    _pinnedAgentId: string | undefined,
    _chatAgentService: ChatAgentService | undefined,
): readonly ChatMode[] {
    return QAAP_BACKEND_INTERACTION_MODES;
}

export function describeComposerInteractionMode(modeId: string | undefined): string | undefined {
    if (!modeId || modeId === 'agent') {
        return undefined;
    }
    if (modeId === 'plan') {
        return nls.localize(
            'qaap/mobileProjects/modePlanActive',
            'Plan mode — QAIQ will draft a plan only. No edits or commands until you switch to Agent.',
        );
    }
    if (modeId === 'ask') {
        return nls.localize(
            'qaap/mobileProjects/modeAskActive',
            'Ask mode — read-only answers about the codebase. No file edits or shell commands.',
        );
    }
    return undefined;
}

const PLAN_MODE_PREFIX = nls.localize(
    'qaap/mobileProjects/planModePrefix',
    '[QAIQ Plan mode] Respond with a concise markdown plan only: goals, steps, risks, and open questions. '
        + 'Do not edit files, run shell commands, or invoke tools until the user explicitly approves the plan '
        + 'and switches to Agent mode.',
);

const ASK_MODE_PREFIX = nls.localize(
    'qaap/mobileProjects/askModePrefix',
    '[QAIQ Ask mode] Read-only: answer questions about the codebase using search/read tools only when needed. '
        + 'Do not modify files, run destructive shell commands, or propose edits.',
);

export function applyBackendInteractionModeToPrompt(prompt: string, modeId: string | undefined): string {
    const trimmed = prompt.trim();
    if (!trimmed || !modeId || modeId === 'agent') {
        return prompt;
    }
    if (modeId === 'plan') {
        return [PLAN_MODE_PREFIX, '', trimmed].join('\n');
    }
    if (modeId === 'ask') {
        return [ASK_MODE_PREFIX, '', trimmed].join('\n');
    }
    return prompt;
}
