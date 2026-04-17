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

import { ReasoningLevel } from '@theia/ai-core';

/**
 * Translates a reasoning level to the OpenAI request fragment to merge into `settings`.
 * Returns `{}` when reasoning is not requested, unsupported, or disabled — so the caller
 * can spread it unconditionally.
 *
 * @param forResponseApi `true` for the Responses API (`reasoning: { effort }`, supports `minimal`);
 *                        `false` for Chat Completions (`reasoning_effort`, `low`|`medium`|`high` only).
 * @param supportsReasoning `false` for models without reasoning support — returns `{}`.
 */
export function openAiReasoningFor(
    level: ReasoningLevel | undefined,
    forResponseApi: boolean,
    supportsReasoning: boolean
): Record<string, unknown> {
    if (!level || !supportsReasoning) {
        return {};
    }
    if (forResponseApi) {
        const responsesEffort =
            level === 'minimal' ? 'minimal' :
                level === 'low' ? 'low' :
                    level === 'medium' ? 'medium' :
                        level === 'high' ? 'high' :
                            undefined;
        return responsesEffort ? { reasoning: { effort: responsesEffort } } : {};
    }
    // Chat Completions has no 'minimal' — map it down to 'low'.
    const chatEffort =
        level === 'minimal' || level === 'low' ? 'low' :
            level === 'medium' ? 'medium' :
                level === 'high' ? 'high' :
                    undefined;
    return chatEffort ? { reasoning_effort: chatEffort } : {};
}
