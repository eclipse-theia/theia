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

import { nls } from '@theia/core/lib/common/nls';
import { ReasoningLevel } from '../common/language-model';

export function reasoningLevelLabel(level: ReasoningLevel): string {
    switch (level) {
        case 'off': return nls.localizeByDefault('Off');
        case 'none': return nls.localizeByDefault('None');
        case 'minimal': return nls.localizeByDefault('Minimal');
        case 'low': return nls.localizeByDefault('Low');
        case 'medium': return nls.localizeByDefault('Medium');
        case 'high': return nls.localizeByDefault('High');
        case 'xhigh': return nls.localizeByDefault('Extra High');
        case 'max': return nls.localizeByDefault('Max');
        case 'auto': return nls.localizeByDefault('Auto');
    }
}

export function reasoningLevelDescription(level: ReasoningLevel): string | undefined {
    switch (level) {
        case 'off': return nls.localize('theia/ai/core/reasoning/offDescription',
            'Omits explicit reasoning effort, allowing provider defaults or raw request settings to apply; on Ollama, disables thinking.');
        case 'none': return nls.localize('theia/ai/core/reasoning/noneDescription', 'Explicitly requests no reasoning.');
        default: return undefined;
    }
}
