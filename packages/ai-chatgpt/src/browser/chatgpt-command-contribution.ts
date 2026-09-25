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

import { Command, CommandContribution, CommandRegistry, Disposable, DisposableCollection, MessageService, nls } from '@theia/core';
import { ConfirmDialog, Dialog, QuickInputService } from '@theia/core/lib/browser';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ChatGptAuthService, ChatGptAuthState } from '../common';

export namespace ChatGptCommands {
    export const SIGN_IN: Command = Command.toLocalizedCommand(
        { id: 'chatgpt.signIn', label: 'Sign in', category: 'ChatGPT' },
        'theia/ai/chatgpt/commands/signIn',
        'theia/ai/chatgpt/category'
    );

    export const SIGN_OUT: Command = Command.toLocalizedCommand(
        { id: 'chatgpt.signOut', label: 'Sign out', category: 'ChatGPT' },
        'theia/ai/chatgpt/commands/signOut',
        'theia/ai/chatgpt/category'
    );
}

/**
 * Drives the "Sign in with ChatGPT" flow: the authorization page is opened in the user's browser and the
 * authorization code is either delivered to the backend's loopback listener or entered manually.
 */
@injectable()
export class ChatGptCommandContribution implements CommandContribution, Disposable {

    @inject(ChatGptAuthService)
    protected readonly authService: ChatGptAuthService;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    protected authState: ChatGptAuthState = { isAuthenticated: false };
    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.authService.getAuthState().then(state => this.authState = state);
        this.toDispose.push(this.authService.onAuthStateChanged(state => this.authState = state));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(ChatGptCommands.SIGN_IN, {
            execute: () => this.signIn(),
            isEnabled: () => !this.authState.isAuthenticated,
            isVisible: () => this.activationService.isActive
        });

        registry.registerCommand(ChatGptCommands.SIGN_OUT, {
            execute: () => this.signOut(),
            isEnabled: () => this.authState.isAuthenticated,
            isVisible: () => this.activationService.isActive
        });
    }

    protected async signIn(): Promise<void> {
        try {
            const session = await this.authService.startLogin();
            this.windowService.openNewWindow(session.authorizationUrl, { external: true });
            const success = session.callbackListening ? await this.awaitAuthorization() : await this.requestAuthorizationCode();
            if (success) {
                this.authState = await this.authService.getAuthState();
                this.messageService.info(this.authState.accountLabel
                    ? nls.localize('theia/ai/chatgpt/signedInAs', 'Signed in to ChatGPT as {0}.', this.authState.accountLabel)
                    : nls.localize('theia/ai/chatgpt/signedIn', 'Signed in to ChatGPT.'));
            }
        } catch (error) {
            await this.authService.cancelLogin();
            this.messageService.error(nls.localize('theia/ai/chatgpt/signInFailed', 'The ChatGPT sign in failed: {0}',
                error instanceof Error ? error.message : String(error)));
        }
    }

    /** Waits for the browser to complete the sign in while offering to enter the authorization code manually. */
    protected async awaitAuthorization(): Promise<boolean> {
        const enterCode = nls.localize('theia/ai/chatgpt/enterCode', 'Enter code manually');
        const chosenAction = this.messageService.info(
            nls.localize('theia/ai/chatgpt/waiting', 'Complete the ChatGPT sign in in your browser.'), enterCode);
        const outcome = await Promise.race([
            this.authService.waitForLogin().then(success => ({ success })),
            chosenAction.then(action => ({ action }))
        ]);
        if ('success' in outcome) {
            return outcome.success;
        }
        if (outcome.action === enterCode) {
            return this.requestAuthorizationCode();
        }
        return this.authService.waitForLogin();
    }

    protected async requestAuthorizationCode(): Promise<boolean> {
        const input = await this.quickInputService.input({
            prompt: nls.localize('theia/ai/chatgpt/codePrompt', 'Paste the authorization code or the full redirect URL from your browser'),
            ignoreFocusLost: true
        });
        if (input === undefined) {
            await this.authService.cancelLogin();
            return false;
        }
        return this.authService.completeLogin(input);
    }

    protected async signOut(): Promise<void> {
        const confirmed = await new ConfirmDialog({
            title: nls.localize('theia/ai/chatgpt/signOutTitle', 'Sign out of ChatGPT'),
            msg: nls.localize('theia/ai/chatgpt/signOutConfirm', 'Are you sure you want to sign out of ChatGPT?'),
            ok: Dialog.YES,
            cancel: Dialog.NO
        }).open();
        if (confirmed) {
            await this.authService.signOut();
        }
    }
}
