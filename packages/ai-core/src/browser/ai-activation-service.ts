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
import { PREFERENCE_NAME_ENABLE_EXPERIMENTAL } from './ai-core-preferences';

/**
 * Context key for the experimental AI feature. It is set to `true` if the feature is enabled.
 */
// We reuse the enablement preference for the context key
export const EXPERIMENTAL_AI_CONTEXT_KEY = PREFERENCE_NAME_ENABLE_EXPERIMENTAL;

@injectable()
export class AIActivationService implements FrontendApplicationContribution {
    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    protected isExperimentalEnabledKey: ContextKey<boolean>;

    protected onDidChangeExperimental = new Emitter<boolean>();
    get onDidChangeActiveStatus(): Event<boolean> {
        return this.onDidChangeExperimental.event;
    }

    get isActive(): boolean {
        return this.isExperimentalEnabledKey.get() ?? false;
    }

    initialize(): MaybePromise<void> {
        this.isExperimentalEnabledKey = this.contextKeyService.createKey(EXPERIMENTAL_AI_CONTEXT_KEY, false);
        this.preferenceService.onPreferenceChanged(e => {
            if (e.preferenceName === PREFERENCE_NAME_ENABLE_EXPERIMENTAL) {
                this.isExperimentalEnabledKey.set(e.newValue);
                this.onDidChangeExperimental.fire(e.newValue);
            }
        });
    }
}
