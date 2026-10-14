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

import { LanguageModelRequest, resolveCompactionTokenThreshold, resolveServerSideCompaction } from '@theia/ai-core';
import { isObject } from '@theia/core';
import { openAiReasoningFor } from './openai-reasoning';

/** Merges request settings with reasoning defaults, preserving user fields while the selected level determines effort. */
export function getOpenAiRequestSettings(request: LanguageModelRequest, forResponseApi: boolean, supportsReasoning: boolean): Record<string, unknown> {
    const reasoning = openAiReasoningFor(request.reasoning?.level, forResponseApi, supportsReasoning);
    const ours = reasoning.reasoning;
    const theirs = request.settings?.reasoning;
    if (isObject(ours) && isObject(theirs)) {
        const effort = (ours as { effort?: string }).effort;
        return { ...request.settings, reasoning: { ...ours, ...theirs, ...(effort !== undefined && { effort }) } };
    }
    return { ...request.settings, ...reasoning };
}

/** Adds automatic compaction when enabled; otherwise preserves the settings unchanged. */
export function applyResponseApiCompaction(
    settings: Record<string, unknown>,
    request: LanguageModelRequest,
    model: {
        serverSideCompactionSupport: boolean;
        serverSideCompactionEnabledByDefault: boolean;
        serverSideCompactionTokenThresholdByDefault?: number;
    }
): Record<string, unknown> {
    if (resolveServerSideCompaction(model.serverSideCompactionSupport, model.serverSideCompactionEnabledByDefault, request.compaction)) {
        const tokenThreshold = resolveCompactionTokenThreshold(model.serverSideCompactionTokenThresholdByDefault, request.compaction);
        return {
            ...settings,
            context_management: [{
                type: 'compaction',
                ...(tokenThreshold !== undefined && { compact_threshold: tokenThreshold })
            }]
        };
    }
    return settings;
}
