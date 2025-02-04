// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core/lib/browser';
import { PREF_AI_INLINE_COMPLETION_STRIP_BACKTICKS } from './ai-code-completion-preference';

export interface CodeCompletionPostProcessor {
    postProcess(text: string): string;
}
export const CodeCompletionPostProcessor = Symbol('CodeCompletionPostProcessor');

@injectable()
export class DefaultCodeCompletionPostProcessor {

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    public postProcess(text: string): string {
        if (this.preferenceService.get<boolean>(PREF_AI_INLINE_COMPLETION_STRIP_BACKTICKS, true)) {
            return this.stripBackticks(text);
        }
        return text;
    }

    public stripBackticks(text: string): string {
        if (text.startsWith('```')) {
            // Remove the first backticks and any language identifier
            const startRemoved = text.slice(3).replace(/^\w*\n/, '');
            const lastBacktickIndex = startRemoved.lastIndexOf('```');
            return lastBacktickIndex !== -1 ? startRemoved.slice(0, lastBacktickIndex).trim() : startRemoved.trim();
        }
        return text;
    }
}
