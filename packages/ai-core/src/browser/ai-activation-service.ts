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
import { FrontendApplicationContribution } from '@theia/core/lib/browser';

export const AIActivationService = Symbol('AIActivationService');
/**
 * AIActivationService is used to manage the activation state of AI features in Theia.
 */
export interface AIActivationService {
    isActive: boolean;
    onDidChangeActiveStatus: Event<boolean>;
}
import { Emitter, Event } from '@theia/core';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';

/**
 * Context key for the AI features. It is set to `true` if the feature is enabled.
 */
export const ENABLE_AI_CONTEXT_KEY = 'ai-features.AiEnable.enableAI';

/**
 * Default implementation of AIActivationService marks the feature active by default.
 *
 * Adopters may override this implementation to provide custom activation logic.
 *
 * Note that '@theia/ai-ide' also overrides this service to provide activation based on preferences,
 * disabling the feature by default.
 */
@injectable()
export class AIActivationServiceImpl implements AIActivationService, FrontendApplicationContribution {

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    isActive: boolean = true;

    protected onDidChangeAIEnabled = new Emitter<boolean>();
    get onDidChangeActiveStatus(): Event<boolean> {
        return this.onDidChangeAIEnabled.event;
    }

    initialize(): void {
        this.contextKeyService.createKey(ENABLE_AI_CONTEXT_KEY, true);
    }
}
