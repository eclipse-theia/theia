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
 * Translates a reasoning level to Ollama's `think` parameter. Most models accept a boolean,
 * but some (e.g. GPT-OSS) require an effort string — set {@link requiresEffortLevel} for those.
 * Returns `false` when reasoning is not requested or disabled.
 */
export function ollamaThinkParamFor(
    level: ReasoningLevel | undefined,
    requiresEffortLevel: boolean
): boolean | 'low' | 'medium' | 'high' {
    if (!level || level === 'off') {
        return false;
    }
    if (!requiresEffortLevel) {
        return true;
    }
    switch (level) {
        case 'minimal':
        case 'low': return 'low';
        case 'high': return 'high';
        default: return 'medium'; // 'medium' and 'auto'
    }
}
