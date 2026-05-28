// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ChatMode } from '@theia/ai-chat/lib/common/chat-agents';
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service';
import { nls } from '@theia/core/lib/common/nls';
import { hashString, isTheiaCoderAgent, QAIQ_AGENT_ID, THEIA_CODER_AGENT_ID } from './qaap-agent-task-client';

const SELECTED_MODE_STORAGE_KEY = 'qaap.mobile.projects.selectedMode';

/** Cursor-style interaction modes for VPS agents (QAIQ, Aider, …). */
export const QAAP_BACKEND_INTERACTION_MODES: readonly ChatMode[] = [
    { id: 'agent', name: nls.localize('qaap/mobileProjects/modeAgent', 'Agent'), isDefault: true },
    { id: 'plan', name: nls.localize('qaap/mobileProjects/modePlan', 'Plan') },
    { id: 'ask', name: nls.localize('qaap/mobileProjects/modeAsk', 'Ask') },
];

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

/**
 * Modes shown in the mobile sticky composer toolbar.
 * Coder uses Theia prompt variants; VPS agents use {@link QAAP_BACKEND_INTERACTION_MODES}.
 */
export function resolveStickyComposerModes(
    pinnedAgentId: string | undefined,
    chatAgentService: ChatAgentService | undefined,
): readonly ChatMode[] {
    if (isTheiaCoderAgent(pinnedAgentId)) {
        const modes = chatAgentService?.getAgent(THEIA_CODER_AGENT_ID)?.modes;
        return modes && modes.length > 0 ? modes : [];
    }
    if (pinnedAgentId === QAIQ_AGENT_ID) {
        const modes = chatAgentService?.getAgent(QAIQ_AGENT_ID)?.modes;
        if (modes && modes.length > 0) {
            return modes;
        }
    }
    if (pinnedAgentId && !isTheiaCoderAgent(pinnedAgentId)) {
        return QAAP_BACKEND_INTERACTION_MODES;
    }
    return [];
}

const PLAN_MODE_PREFIX = nls.localize(
    'qaap/mobileProjects/planModePrefix',
    '[Plan mode — respond with a concise markdown plan only. Do not edit files or run commands until the user approves.]',
);

const ASK_MODE_PREFIX = nls.localize(
    'qaap/mobileProjects/askModePrefix',
    '[Ask mode — read-only: answer questions about the codebase. Do not modify files or run shell commands.]',
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
