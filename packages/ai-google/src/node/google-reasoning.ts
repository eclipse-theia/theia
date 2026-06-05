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

/**
 * Translates a reasoning level to the Gemini request fragment to merge into `settings`.
 * Returns `{}` when reasoning is not requested, unsupported, or disabled — so the caller
 * can spread it unconditionally. Per the Gemini docs `thinkingLevel` and `thinkingBudget`
 * must never appear together.
 *
 * @param api `'effort'` for `thinkingConfig.thinkingLevel` (string enum),
 *            `'budget'` for `thinkingConfig.thinkingBudget` (`-1` dynamic, positive = token cap).
 */
export function googleReasoningFor(level: ReasoningLevel | undefined, api: ReasoningApi | undefined): Record<string, unknown> {
    if (!level || !api || level === 'off') {
        return {};
    }
    if (api === 'effort') {
        const thinkingLevel =
            level === 'minimal' ? 'minimal' :
                level === 'low' ? 'low' :
                    level === 'medium' ? 'medium' :
                        level === 'high' ? 'high' :
                            undefined; // 'auto' → omit so the provider default applies
        return thinkingLevel ? { thinkingConfig: { thinkingLevel, includeThoughts: true } } : {};
    }
    const thinkingBudget =
        level === 'auto' ? -1 :
            level === 'minimal' ? 1024 :
                level === 'low' ? 4096 :
                    level === 'medium' ? 16000 :
                        level === 'high' ? 24576 :
                            -1;
    return { thinkingConfig: { thinkingBudget, includeThoughts: true } };
}
