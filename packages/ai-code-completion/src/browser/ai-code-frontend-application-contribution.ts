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
import { inject, injectable } from '@theia/core/shared/inversify';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { Disposable } from '@theia/core';
import { AICodeInlineCompletionsProvider } from './ai-code-inline-completion-provider';
import { PREF_AI_INLINE_COMPLETION_ENABLE, PREF_AI_INLINE_COMPLETION_EXCLUDED_EXTENSIONS } from './ai-code-completion-preference';

@injectable()
export class AIFrontendApplicationContribution implements FrontendApplicationContribution {
    @inject(AICodeInlineCompletionsProvider)
    private inlineCodeCompletionProvider: AICodeInlineCompletionsProvider;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    private toDispose = new Map<string, Disposable>();

    onDidInitializeLayout(): void {
        this.preferenceService.ready.then(() => {
            this.handlePreferences();
        });
    }

    protected handlePreferences(): void {
        const handler = () => this.handleInlineCompletions();

        this.toDispose.set('inlineCompletions', handler());

        this.preferenceService.onPreferenceChanged(event => {
            if (event.preferenceName === PREF_AI_INLINE_COMPLETION_ENABLE || event.preferenceName === PREF_AI_INLINE_COMPLETION_EXCLUDED_EXTENSIONS) {
                this.toDispose.get('inlineCompletions')?.dispose();
                this.toDispose.set('inlineCompletions', handler());
            }
        });

        this.activationService.onDidChangeActiveStatus(change => {
            this.toDispose.get('inlineCompletions')?.dispose();
            this.toDispose.set('inlineCompletions', handler());
        });
    }

    protected handleInlineCompletions(): Disposable {
        const enable = this.preferenceService.get<boolean>(PREF_AI_INLINE_COMPLETION_ENABLE, false) && this.activationService.isActive;

        if (!enable) {
            return Disposable.NULL;
        }

        const excludedExtensions = this.preferenceService.get<string[]>(PREF_AI_INLINE_COMPLETION_EXCLUDED_EXTENSIONS, []);

        return monaco.languages.registerInlineCompletionsProvider(
            { scheme: 'file' },
            {
                provideInlineCompletions: (model, position, context, token) => {
                    const fileName = model.uri.toString();

                    if (excludedExtensions.some(ext => fileName.endsWith(ext))) {
                        return { items: [] };
                    }
                    return this.inlineCodeCompletionProvider.provideInlineCompletions(model, position, context, token);
                },
                freeInlineCompletions: completions => {
                    this.inlineCodeCompletionProvider.freeInlineCompletions(completions);
                }
            }
        );
    }
}
