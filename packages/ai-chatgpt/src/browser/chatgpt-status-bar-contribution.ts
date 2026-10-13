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

import { AIActivationService } from '@theia/ai-core/lib/browser';
import { Disposable, DisposableCollection, nls, PreferenceService } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar-types';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CHATGPT_ENABLED_PREF, ChatGptAuthService, ChatGptAuthState } from '../common';
import { ChatGptCommands } from './chatgpt-command-contribution';

const CHATGPT_STATUS_BAR_ID = 'chatgpt-auth-status';

@injectable()
export class ChatGptStatusBarContribution implements FrontendApplicationContribution, Disposable {

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(ChatGptAuthService)
    protected readonly authService: ChatGptAuthService;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    protected authState: ChatGptAuthState = { isAuthenticated: false };
    protected authGeneration = 0;
    protected disposed = false;
    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.authService.onAuthStateChanged(state => {
            this.authGeneration++;
            this.authState = state;
            this.updateStatusBar();
        }));
        this.toDispose.push(this.activationService.onDidChangeActiveStatus(() => this.updateStatusBar()));
        this.toDispose.push(this.preferenceService.onPreferenceChanged(event => {
            if (event.preferenceName === CHATGPT_ENABLED_PREF) {
                this.updateStatusBar();
            }
        }));
    }

    onStart(): void {
        const generation = this.authGeneration;
        this.authService.getAuthState().then(state => {
            if (!this.disposed && generation === this.authGeneration) {
                this.authState = state;
                this.updateStatusBar();
            }
        });
    }

    dispose(): void {
        this.disposed = true;
        this.toDispose.dispose();
        this.statusBar.removeElement(CHATGPT_STATUS_BAR_ID);
    }

    protected updateStatusBar(): void {
        if (!this.activationService.isActive || !this.preferenceService.get<boolean>(CHATGPT_ENABLED_PREF, true)) {
            this.statusBar.removeElement(CHATGPT_STATUS_BAR_ID);
            return;
        }
        const accountLabel = this.authState.accountLabel ?? 'ChatGPT';
        this.statusBar.setElement(CHATGPT_STATUS_BAR_ID, {
            text: this.authState.isAuthenticated ? `$(openai) ChatGPT: ${accountLabel}`
                : `$(openai) ${nls.localize('theia/ai/chatgpt/models/signIn', 'Sign in with ChatGPT')}`,
            tooltip: this.authState.isAuthenticated
                ? nls.localize('theia/ai/chatgpt/statusBar/signedIn', 'Signed in to ChatGPT as {0}. Click to sign out.', accountLabel)
                : nls.localize('theia/ai/chatgpt/statusBar/signedOut', 'Not signed in to ChatGPT. Click to sign in.'),
            alignment: StatusBarAlignment.RIGHT,
            priority: 100,
            command: this.authState.isAuthenticated ? ChatGptCommands.SIGN_OUT.id : ChatGptCommands.SIGN_IN.id
        });
    }
}
