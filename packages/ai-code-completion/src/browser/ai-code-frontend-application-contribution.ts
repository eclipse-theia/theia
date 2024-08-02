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

import * as monaco from '@theia/monaco-editor-core';

import { FrontendApplicationContribution, PreferenceService } from '@theia/core/lib/browser';
import { AICodeCompletionProvider } from './ai-code-completion-provider';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Disposable } from '@theia/core';
import { AICodeInlineCompletionsProvider } from './ai-code-inline-completion-provider';
import { PREF_AI_CODE_COMPLETION_ENABLE, PREF_AI_INLINE_COMPLETION_ENABLE } from './ai-code-completion-preference';

@injectable()
export class AIFrontendApplicationContribution implements FrontendApplicationContribution {
    @inject(AICodeCompletionProvider)
    private codeCompletionProvider: AICodeCompletionProvider;

    @inject(AICodeInlineCompletionsProvider)
    private inlineCodeCompletionProvider: AICodeInlineCompletionsProvider;

    @inject(PreferenceService)
    private readonly preferenceService: PreferenceService;

    private toDispose = new Map<string, Disposable>();

    onDidInitializeLayout(): void {
        this.handlePreference(PREF_AI_CODE_COMPLETION_ENABLE, enable => this.handleCodeCompletions(enable));
        this.handlePreference(PREF_AI_INLINE_COMPLETION_ENABLE, enable => this.handleInlineCompletions(enable));
    }

    protected handlePreference(name: string, handler: (enable: boolean) => Disposable): void {
        const enable = this.preferenceService.get<boolean>(name, false);
        this.toDispose.set(name, handler(enable));

        this.preferenceService.onPreferenceChanged(event => {
            if (event.preferenceName === name) {
                this.toDispose.get(name)?.dispose();
                this.toDispose.set(name, handler(event.newValue));
            }
        });
    }

    protected handleCodeCompletions(enable: boolean): Disposable {
        return enable ? monaco.languages.registerCompletionItemProvider({ scheme: 'file' }, this.codeCompletionProvider) : Disposable.NULL;
    }

    protected handleInlineCompletions(enable: boolean): Disposable {
        return enable ? monaco.languages.registerInlineCompletionsProvider({ scheme: 'file' }, this.inlineCodeCompletionProvider) : Disposable.NULL;
    }
}
