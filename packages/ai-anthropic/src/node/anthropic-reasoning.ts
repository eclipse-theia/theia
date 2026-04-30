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

import { ReasoningApi, ReasoningLevel } from '@theia/ai-core';

type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * Translates a reasoning level to the Anthropic request fragment to merge into `settings`.
 * Returns `{}` when reasoning is not requested, unsupported, or disabled — so the caller
 * can spread it unconditionally.
 *
 * See https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking.
 *
 * @param api `'effort'` for adaptive thinking, `'budget'` for legacy extended thinking.
 * @param supportsXHighEffort set on models that accept the `xhigh` effort value.
 */
export function anthropicReasoningFor(
    level: ReasoningLevel | undefined,
    api: ReasoningApi | undefined,
    supportsXHighEffort: boolean = false
): Record<string, unknown> {
    if (!level || !api || level === 'off') {
        return {};
    }
    if (api === 'effort') {
        const effort = anthropicEffortForLevel(level, supportsXHighEffort);
        // On `auto`, omit `output_config` so Anthropic's own default applies.
        return {
            thinking: { type: 'adaptive', display: 'summarized' },
            ...(effort ? { output_config: { effort } } : {})
        };
    }
    // Legacy extended thinking requires a minimum budget of 1024 tokens.
    return { thinking: { type: 'enabled', budget_tokens: anthropicBudgetForLevel(level) } };
}

function anthropicEffortForLevel(level: ReasoningLevel, supportsXHighEffort: boolean): AnthropicEffort | undefined {
    switch (level) {
        case 'minimal': return 'low';
        case 'low': return 'medium';
        case 'medium': return supportsXHighEffort ? 'xhigh' : 'high';
        case 'high': return 'max';
        default: return undefined; // 'auto' → provider default
    }
}

function anthropicBudgetForLevel(level: ReasoningLevel): number {
    switch (level) {
        case 'minimal': return 1024;
        case 'low': return 4096;
        case 'medium': return 16000;
        case 'high': return 32000;
        default: return 8000; // 'auto' has no native equivalent on the legacy API
    }
}
