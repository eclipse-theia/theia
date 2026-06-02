// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { NATIVE_MODEL_CATALOG_EXCLUDED_AGENT_IDS } from './qaap-builtin-agents';
import {
    hashString,
    isQaiqAgent,
    isTheiaCoderAgent,
    migrateLegacyBackendAgentId,
    SELECTED_QAIQ_MODEL_STORAGE_KEY,
    SHELL_AGENT_ID,
    type QaapCreateAgentTaskQaiqModel,
    type QaapQaiqModelOption,
} from './qaap-agent-task-client';

export type QaapAgentModelSelection = QaapCreateAgentTaskQaiqModel;

const AGENT_MODEL_STORAGE_PREFIX = 'qaap.agentTasks.selectedAgentModel';

/** Only QAIQ uses the OpenRouter/NVIDIA/etc. lists from Settings → AI Features. */
export const SETTINGS_MODEL_CATALOG_AGENT_IDS = new Set(['qaiq']);

export function agentUsesSettingsModelCatalog(agentId: string | undefined): boolean {
    const normalized = migrateLegacyBackendAgentId(agentId)?.toLowerCase();
    return !!normalized && SETTINGS_MODEL_CATALOG_AGENT_IDS.has(normalized);
}

/** VPS agents with their own model catalog (CLI or curated), not the Settings BYOK lists. */
export function agentUsesNativeModelCatalog(agentId: string | undefined): boolean {
    const normalized = migrateLegacyBackendAgentId(agentId)?.toLowerCase();
    if (!normalized || normalized === SHELL_AGENT_ID || isTheiaCoderAgent(normalized)) {
        return false;
    }
    if (NATIVE_MODEL_CATALOG_EXCLUDED_AGENT_IDS.has(normalized)) {
        return false;
    }
    return !agentUsesSettingsModelCatalog(normalized);
}

/** Agent exposes a model submenu (Settings catalog for QAIQ, native catalog for other VPS agents). */
export function agentSupportsModelPicker(agentId: string | undefined): boolean {
    const normalized = migrateLegacyBackendAgentId(agentId)?.toLowerCase();
    if (!normalized || normalized === SHELL_AGENT_ID || isTheiaCoderAgent(normalized)) {
        return false;
    }
    return agentUsesSettingsModelCatalog(normalized) || agentUsesNativeModelCatalog(normalized);
}

export function scopedAgentModelStorageKey(cwd: string, agentId: string): string {
    const agent = migrateLegacyBackendAgentId(agentId) ?? agentId;
    return `${AGENT_MODEL_STORAGE_PREFIX}.${hashString(cwd)}.${agent}`;
}

function parseStoredModel(raw: string | null | undefined): QaapAgentModelSelection | undefined {
    if (!raw) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(raw) as Partial<QaapAgentModelSelection>;
        if (!parsed || typeof parsed.provider !== 'string' || typeof parsed.modelId !== 'string') {
            return undefined;
        }
        return {
            provider: parsed.provider as QaapAgentModelSelection['provider'],
            vendor: typeof parsed.vendor === 'string' ? parsed.vendor : 'unknown',
            modelId: parsed.modelId,
        };
    } catch {
        return undefined;
    }
}

export function readStoredAgentModel(cwd: string | undefined, agentId: string | undefined): QaapAgentModelSelection | undefined {
    if (!cwd || !agentId || !agentSupportsModelPicker(agentId)) {
        return undefined;
    }
    try {
        const agent = migrateLegacyBackendAgentId(agentId) ?? agentId;
        const scoped = parseStoredModel(window.localStorage.getItem(scopedAgentModelStorageKey(cwd, agent)));
        if (scoped) {
            return scoped;
        }
        if (isQaiqAgent(agent)) {
            return readLegacyQaiqModel(cwd);
        }
        return undefined;
    } catch {
        return undefined;
    }
}

function readLegacyQaiqModel(cwd: string): QaapAgentModelSelection | undefined {
    const raw = window.localStorage.getItem(`${SELECTED_QAIQ_MODEL_STORAGE_KEY}.${hashString(cwd)}`)
        ?? window.localStorage.getItem(SELECTED_QAIQ_MODEL_STORAGE_KEY)
        ?? undefined;
    return parseStoredModel(raw ?? undefined);
}

export function writeStoredAgentModel(
    cwd: string | undefined,
    agentId: string,
    model: QaapAgentModelSelection | QaapQaiqModelOption,
): void {
    if (!cwd || !agentSupportsModelPicker(agentId)) {
        return;
    }
    const agent = migrateLegacyBackendAgentId(agentId) ?? agentId;
    const payload: QaapAgentModelSelection = {
        provider: model.provider,
        vendor: model.vendor,
        modelId: model.modelId,
    };
    try {
        const serialized = JSON.stringify(payload);
        window.localStorage.setItem(scopedAgentModelStorageKey(cwd, agent), serialized);
        if (isQaiqAgent(agent)) {
            window.localStorage.setItem(`${SELECTED_QAIQ_MODEL_STORAGE_KEY}.${hashString(cwd)}`, serialized);
            window.localStorage.setItem(SELECTED_QAIQ_MODEL_STORAGE_KEY, serialized);
        }
    } catch {
        /* localStorage unavailable */
    }
}

export function isSameAgentModel(
    stored: QaapAgentModelSelection | undefined,
    model: QaapQaiqModelOption,
): boolean {
    return !!stored
        && stored.provider === model.provider
        && stored.vendor === model.vendor
        && stored.modelId === model.modelId;
}

export function resolveStoredAgentModelForSubmit(
    agentId: string | undefined,
    cwd: string | undefined,
): QaapAgentModelSelection | undefined {
    return readStoredAgentModel(cwd, agentId);
}
