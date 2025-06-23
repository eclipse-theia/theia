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
import { FrontendApplicationContribution, PreferenceService } from '@theia/core/lib/browser';
import { Emitter, MaybePromise, Event, } from '@theia/core';
import { ContextKeyService, ContextKey } from '@theia/core/lib/browser/context-key-service';
import { PREFERENCE_NAME_ENABLE_AI } from './ai-core-preferences';

/**
 * Context key for the AI features. It is set to `true` if the feature is enabled.
 */
// We reuse the enablement preference for the context key
export const ENABLE_AI_CONTEXT_KEY = PREFERENCE_NAME_ENABLE_AI;

@injectable()
export class AIActivationService implements FrontendApplicationContribution {
    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    protected isAiEnabledKey: ContextKey<boolean>;

    protected onDidChangeAIEnabled = new Emitter<boolean>();
    get onDidChangeActiveStatus(): Event<boolean> {
        return this.onDidChangeAIEnabled.event;
    }

    get isActive(): boolean {
        return this.isAiEnabledKey.get() ?? false;
    }

    protected updateEnableValue(value: boolean): void {
        if (value !== this.isAiEnabledKey.get()) {
            this.isAiEnabledKey.set(value);
            this.onDidChangeAIEnabled.fire(value);
        }
    }

    initialize(): MaybePromise<void> {
        this.isAiEnabledKey = this.contextKeyService.createKey(ENABLE_AI_CONTEXT_KEY, false);
        // make sure we don't miss once preferences are ready
        this.preferenceService.ready.then(() => {
            const enableValue = this.preferenceService.get<boolean>(PREFERENCE_NAME_ENABLE_AI, false);
            this.updateEnableValue(enableValue);
        });
        this.preferenceService.onPreferenceChanged(e => {
            if (e.preferenceName === PREFERENCE_NAME_ENABLE_AI) {
                this.updateEnableValue(e.newValue);
            }
        });
    }
}
