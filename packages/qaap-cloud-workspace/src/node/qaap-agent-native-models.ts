// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { spawnSync } from 'child_process';
import type { QaapQaiqModelOption } from '@theia/qaap-mobile-shell/lib/common/qaap-agent-task-client';
import {
    agentUsesNativeModelCatalog,
    listStaticNativeAgentModels,
    parseNativeModelLines,
} from '../common/qaap-agent-native-model-catalog';

const cache = new Map<string, QaapQaiqModelOption[]>();

export function listNativeAgentModels(agentId: string | undefined): QaapQaiqModelOption[] {
    const normalized = agentId?.trim().toLowerCase();
    if (!normalized || !agentUsesNativeModelCatalog(normalized)) {
        return [];
    }
    const cached = cache.get(normalized);
    if (cached) {
        return cached;
    }
    const discovered = discoverNativeAgentModels(normalized);
    const models = discovered.length > 0 ? discovered : listStaticNativeAgentModels(normalized);
    cache.set(normalized, models);
    return models;
}

export function clearNativeAgentModelCache(): void {
    cache.clear();
}

function discoverNativeAgentModels(agentId: string): QaapQaiqModelOption[] {
    switch (agentId) {
        case 'opencode':
            return discoverFromCommand('opencode', ['models'], agentId);
        default:
            return [];
    }
}

function discoverFromCommand(bin: string, args: string[], agentId: string): QaapQaiqModelOption[] {
    try {
        const result = spawnSync(bin, args, { encoding: 'utf8', timeout: 15_000 });
        const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
        const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        return parseNativeModelLines(agentId, lines);
    } catch {
        return [];
    }
}
