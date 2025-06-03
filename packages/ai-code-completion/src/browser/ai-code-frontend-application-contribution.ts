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

import { AIActivationService } from '@theia/ai-core/lib/browser';
import { Disposable } from '@theia/core';
import { FrontendApplicationContribution, KeybindingContribution, KeybindingRegistry, PreferenceService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { InlineCompletionTriggerKind } from '@theia/monaco-editor-core/esm/vs/editor/common/languages';
import {
    PREF_AI_INLINE_COMPLETION_AUTOMATIC_ENABLE,
    PREF_AI_INLINE_COMPLETION_DEBOUNCE_DELAY,
    PREF_AI_INLINE_COMPLETION_EXCLUDED_EXTENSIONS,
    PREF_AI_INLINE_COMPLETION_CACHE_CAPACITY
} from './ai-code-completion-preference';
import { AICodeInlineCompletionsProvider } from './ai-code-inline-completion-provider';
import { InlineCompletionDebouncer } from './code-completion-debouncer';
import { CodeCompletionCache } from './code-completion-cache';

@injectable()
export class AIFrontendApplicationContribution implements FrontendApplicationContribution, KeybindingContribution {
    @inject(AICodeInlineCompletionsProvider)
    private inlineCodeCompletionProvider: AICodeInlineCompletionsProvider;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    private completionCache = new CodeCompletionCache();
    private debouncer = new InlineCompletionDebouncer();
    private debounceDelay: number;

    private toDispose = new Map<string, Disposable>();

    onDidInitializeLayout(): void {
        this.preferenceService.ready.then(() => {
            this.handlePreferences();
        });
    }

    protected handlePreferences(): void {
        const handler = () => this.handleInlineCompletions();

        this.toDispose.set('inlineCompletions', handler());

        this.debounceDelay = this.preferenceService.get<number>(PREF_AI_INLINE_COMPLETION_DEBOUNCE_DELAY, 300);

        const cacheCapacity = this.preferenceService.get<number>(PREF_AI_INLINE_COMPLETION_CACHE_CAPACITY, 100);
        this.completionCache.setMaxSize(cacheCapacity);

        this.preferenceService.onPreferenceChanged(event => {
            if (event.preferenceName === PREF_AI_INLINE_COMPLETION_AUTOMATIC_ENABLE
                || event.preferenceName === PREF_AI_INLINE_COMPLETION_EXCLUDED_EXTENSIONS) {
                this.toDispose.get('inlineCompletions')?.dispose();
                this.toDispose.set('inlineCompletions', handler());
            }
            if (event.preferenceName === PREF_AI_INLINE_COMPLETION_DEBOUNCE_DELAY) {
                this.debounceDelay = event.newValue;
            }
            if (event.preferenceName === PREF_AI_INLINE_COMPLETION_CACHE_CAPACITY) {
                this.completionCache.setMaxSize(event.newValue);
            }
        });

        this.activationService.onDidChangeActiveStatus(change => {
            this.toDispose.get('inlineCompletions')?.dispose();
            this.toDispose.set('inlineCompletions', handler());
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: 'editor.action.inlineSuggest.trigger',
            keybinding: 'Ctrl+Alt+Space',
            when: '!editorReadonly && editorTextFocus'
        });
    }

    protected handleInlineCompletions(): Disposable {
        if (!this.activationService.isActive) {
            return Disposable.NULL;
        }
        const automatic = this.preferenceService.get<boolean>(PREF_AI_INLINE_COMPLETION_AUTOMATIC_ENABLE, true);
        const excludedExtensions = this.preferenceService.get<string[]>(PREF_AI_INLINE_COMPLETION_EXCLUDED_EXTENSIONS, []);

        return monaco.languages.registerInlineCompletionsProvider(
            { scheme: 'file' },
            {
                provideInlineCompletions: (model, position, context, token) => {
                    if (!automatic && context.triggerKind === InlineCompletionTriggerKind.Automatic) {
                        return { items: [] };
                    }
                    const fileName = model.uri.toString();
                    if (excludedExtensions.some(ext => fileName.endsWith(ext))) {
                        return { items: [] };
                    }

                    const completionHandler = async () => {
                        try {
                            const cacheKey = this.completionCache.generateKey(fileName, model, position);
                            const cachedCompletion = this.completionCache.get(cacheKey);

                            if (cachedCompletion) {
                                return cachedCompletion;
                            }

                            const completion = await this.inlineCodeCompletionProvider.provideInlineCompletions(
                                model,
                                position,
                                context,
                                token
                            );

                            if (completion && completion.items.length > 0) {
                                this.completionCache.put(cacheKey, completion);
                            }

                            return completion;
                        } catch (error) {
                            console.error('Error providing inline completions:', error);
                            return { items: [] };
                        }
                    };

                    if (context.triggerKind === InlineCompletionTriggerKind.Automatic) {
                        return this.debouncer.debounce(async () => completionHandler(), this.debounceDelay);
                    } else if (context.triggerKind === InlineCompletionTriggerKind.Explicit) {
                        return completionHandler();
                    }
                },
                freeInlineCompletions: completions => {
                    this.inlineCodeCompletionProvider.freeInlineCompletions(completions);
                }
            }
        );
    }
}
