// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { inject, injectable, preDestroy } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { DisposableCollection, Emitter, MaybePromise, Event, PreferenceService } from '@theia/core';
import { ContextKeyService, ContextKey } from '@theia/core/lib/browser/context-key-service';
import { AIActivationService, ENABLE_AI_CONTEXT_KEY } from '@theia/ai-core/lib/browser/ai-activation-service';
import { PREFERENCE_NAME_ENABLE_AI } from '../common/ai-ide-preferences';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';

/**
 * Implements AI Activation Service based on preferences.
 */
@injectable()
export class AIIdeActivationServiceImpl implements AIActivationService, FrontendApplicationContribution {
    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    // Intentionally injects the real `PreferenceService` (not `AIPreferenceService`)
    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(WorkspaceTrustService)
    protected workspaceTrustService: WorkspaceTrustService;

    protected isAiEnabledKey: ContextKey<boolean>;

    protected workspaceTrusted = false;

    protected onDidChangeAIEnabled = new Emitter<boolean>();
    get onDidChangeActiveStatus(): Event<boolean> {
        return this.onDidChangeAIEnabled.event;
    }

    protected onDidChangeCanRunEmitter = new Emitter<boolean>();
    get onDidChangeCanRun(): Event<boolean> {
        return this.onDidChangeCanRunEmitter.event;
    }

    protected readonly toDispose = new DisposableCollection(this.onDidChangeAIEnabled, this.onDidChangeCanRunEmitter);

    @preDestroy()
    protected dispose(): void {
        this.toDispose.dispose();
    }

    get isActive(): boolean {
        return this.isAiEnabledKey.get() ?? false;
    }

    get canRun(): boolean {
        return this.isActive && this.workspaceTrusted;
    }

    protected updateEnableValue(value: boolean): void {
        const oldCanRun = this.canRun;
        if (value !== this.isAiEnabledKey.get()) {
            this.isAiEnabledKey.set(value);
            this.onDidChangeAIEnabled.fire(value);
        }
        if (this.canRun !== oldCanRun) {
            this.onDidChangeCanRunEmitter.fire(this.canRun);
        }
    }

    protected updateTrustValue(trusted: boolean): void {
        const oldCanRun = this.canRun;
        this.workspaceTrusted = trusted;
        if (this.canRun !== oldCanRun) {
            this.onDidChangeCanRunEmitter.fire(this.canRun);
        }
    }

    initialize(): MaybePromise<void> {
        this.isAiEnabledKey = this.contextKeyService.createKey(ENABLE_AI_CONTEXT_KEY, false);
        // make sure we don't miss once preferences are ready
        this.preferenceService.ready.then(() => {
            const enableValue = this.preferenceService.get<boolean>(PREFERENCE_NAME_ENABLE_AI, false);
            this.updateEnableValue(enableValue);
        });
        this.toDispose.push(this.preferenceService.onPreferenceChanged(e => {
            if (e.preferenceName === PREFERENCE_NAME_ENABLE_AI) {
                this.updateEnableValue(this.preferenceService.get<boolean>(PREFERENCE_NAME_ENABLE_AI, false));
            }
        }));
        this.workspaceTrustService.getWorkspaceTrust().then(trusted => {
            this.updateTrustValue(trusted);
        });
        this.toDispose.push(this.workspaceTrustService.onDidChangeWorkspaceTrust(trusted => {
            this.updateTrustValue(trusted);
        }));
    }
}
