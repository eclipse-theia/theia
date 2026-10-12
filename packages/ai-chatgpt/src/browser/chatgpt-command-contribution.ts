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

import { Command, CommandContribution, CommandRegistry, Disposable, DisposableCollection, MessageService, nls, PreferenceService } from '@theia/core';
import { ConfirmDialog, Dialog, QuickInputService } from '@theia/core/lib/browser';
import { QuickPickItem } from '@theia/core/lib/common/quick-pick-service';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CHATGPT_AUTHENTICATION_MODE_PREF, CHATGPT_ENABLED_PREF, ChatGptAuthService, ChatGptAuthState } from '../common';

export namespace ChatGptCommands {
    export const SIGN_IN: Command = Command.toLocalizedCommand(
        { id: 'chatgpt.signIn', label: 'Sign in', category: 'ChatGPT' },
        'theia/ai/chatgpt/commands/signIn',
        'theia/ai/chatgpt/category'
    );

    export const SELECT_ACCOUNT: Command = Command.toLocalizedCommand(
        { id: 'chatgpt.selectAccount', label: 'Switch account', category: 'ChatGPT' },
        'theia/ai/chatgpt/commands/selectAccount',
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
 * full callback is either delivered to the backend's loopback listener or entered manually.
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

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    protected authState: ChatGptAuthState = { isAuthenticated: false };
    protected authGeneration = 0;
    protected loginGeneration = 0;
    protected activeLoginId: string | undefined;
    protected disposed = false;
    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.authService.onAuthStateChanged(state => {
            this.authGeneration++;
            this.authState = state;
        }));
        this.refreshAuthState();
    }

    dispose(): void {
        this.disposed = true;
        this.loginGeneration++;
        if (this.activeLoginId) {
            this.authService.cancelLogin(this.activeLoginId).catch(() => undefined);
        }
        this.toDispose.dispose();
    }

    protected async refreshAuthState(): Promise<boolean> {
        const generation = ++this.authGeneration;
        const state = await this.authService.getAuthState();
        if (this.disposed || generation !== this.authGeneration) {
            return false;
        }
        this.authState = state;
        return true;
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(ChatGptCommands.SIGN_IN, {
            execute: () => this.signIn(this.authState.clientId),
            isEnabled: () => !this.authState.isAuthenticated || this.authState.canUseChatGptPlan === false,
            isVisible: () => this.activationService.isActive && this.preferenceService.get<boolean>(CHATGPT_ENABLED_PREF, true)
        });

        registry.registerCommand(ChatGptCommands.SELECT_ACCOUNT, {
            execute: () => this.selectAccount(),
            isVisible: () => this.activationService.isActive && this.preferenceService.get<boolean>(CHATGPT_ENABLED_PREF, true)
        });

        registry.registerCommand(ChatGptCommands.SIGN_OUT, {
            execute: () => this.signOut(),
            isEnabled: () => this.authState.isAuthenticated,
            isVisible: () => this.activationService.isActive && this.preferenceService.get<boolean>(CHATGPT_ENABLED_PREF, true)
        });
    }

    protected async signIn(clientId?: string): Promise<void> {
        const generation = ++this.loginGeneration;
        let loginId: string | undefined;
        try {
            const session = await this.authService.startLogin(clientId);
            loginId = session.loginId;
            if (this.disposed || generation !== this.loginGeneration) {
                await this.authService.cancelLogin(loginId);
                return;
            }
            this.activeLoginId = loginId;
            this.windowService.openNewWindow(session.authorizationUrl, { external: true });
            const success = session.callbackListening
                ? await this.awaitAuthorization(loginId, generation) : await this.requestAuthorizationCode(loginId, generation);
            if (success && !this.disposed && generation === this.loginGeneration
                && await this.refreshAuthState() && generation === this.loginGeneration && this.authState.isAuthenticated) {
                this.messageService.info(this.authState.canUseChatGptPlan === false
                    ? nls.localize('theia/ai/chatgpt/sharingRequired', 'Connected to ChatGPT, but token sharing is not enabled. Sign in again to enable it.')
                    : this.authState.accountLabel
                        ? nls.localize('theia/ai/chatgpt/connectedAs', 'Connected to ChatGPT as {0}. Requests use your ChatGPT subscription.', this.authState.accountLabel)
                        : nls.localize('theia/ai/chatgpt/connected', 'Connected to ChatGPT. Requests use your ChatGPT subscription.'));
            }
        } catch (error) {
            if (loginId) {
                await this.authService.cancelLogin(loginId).catch(() => undefined);
            }
            if (!this.disposed && generation === this.loginGeneration) {
                this.messageService.error(nls.localize('theia/ai/chatgpt/signInFailed', 'The ChatGPT sign in failed: {0}',
                    error instanceof Error ? error.message : String(error)));
            }
        } finally {
            if (generation === this.loginGeneration) {
                this.activeLoginId = undefined;
            }
        }
    }

    protected async selectAccount(): Promise<void> {
        try {
            const generation = this.authGeneration;
            const accounts = await this.authService.getAccounts();
            if (this.disposed || generation !== this.authGeneration) {
                return;
            }
            const items: (QuickPickItem & { clientId?: string })[] = accounts.map(account => ({
                label: account.accountLabel ?? account.clientId,
                description: account.clientId === this.authState.clientId ? nls.localizeByDefault('Current') : undefined,
                detail: account.isAuthenticated
                    ? account.canUseChatGptPlan
                        ? nls.localize('theia/ai/chatgpt/account/connected', 'Connected — uses your ChatGPT subscription')
                        : nls.localize('theia/ai/chatgpt/account/sharingDisabled', 'Connected — token sharing is not enabled')
                    : nls.localize('theia/ai/chatgpt/account/disconnected', 'Disconnected — select to reconnect'),
                clientId: account.clientId
            }));
            items.push({ label: nls.localize('theia/ai/chatgpt/account/add', 'Connect another account') });
            const selected = await this.quickInputService.showQuickPick(items, {
                title: nls.localize('theia/ai/chatgpt/account/select', 'Select a ChatGPT account')
            });
            if (!selected || this.disposed || generation !== this.authGeneration) {
                return;
            }
            if (selected.clientId) {
                await this.authService.selectAccount(selected.clientId);
                if (!await this.refreshAuthState()) {
                    return;
                }
                if (this.authState.isAuthenticated && this.authState.canUseChatGptPlan !== false) {
                    return;
                }
            }
            await this.signIn(selected.clientId);
        } catch (error) {
            this.messageService.error(nls.localize('theia/ai/chatgpt/account/selectFailed', 'The ChatGPT account could not be selected: {0}',
                error instanceof Error ? error.message : String(error)));
        }
    }

    /** Waits for the browser callback while offering to paste its full URL manually. */
    protected async awaitAuthorization(loginId: string, generation: number): Promise<boolean> {
        const enterCode = nls.localize('theia/ai/chatgpt/enterCallback', 'Paste callback URL');
        const chosenAction = this.messageService.info(
            nls.localize('theia/ai/chatgpt/waiting', 'Complete the ChatGPT sign in in your browser.'), enterCode);
        const outcome = await Promise.race([
            this.authService.waitForLogin(loginId).then(success => ({ success })),
            chosenAction.then(action => ({ action }))
        ]);
        if (this.disposed || generation !== this.loginGeneration) {
            return false;
        }
        if ('success' in outcome) {
            return outcome.success;
        }
        if (outcome.action === enterCode) {
            return this.requestAuthorizationCode(loginId, generation);
        }
        return this.authService.waitForLogin(loginId);
    }

    protected async requestAuthorizationCode(loginId: string, generation: number): Promise<boolean> {
        const input = await this.quickInputService.input({
            prompt: this.preferenceService.get(CHATGPT_AUTHENTICATION_MODE_PREF, 'codex') === 'codex'
                ? nls.localize('theia/ai/chatgpt/codexCallbackPrompt', 'Paste the authorization code or redirect URL from your browser')
                : nls.localize('theia/ai/chatgpt/callbackPrompt', 'Paste the full redirect URL from your browser, including the client ID'),
            ignoreFocusLost: true
        });
        if (this.disposed || generation !== this.loginGeneration) {
            return false;
        }
        if (input === undefined) {
            await this.authService.cancelLogin(loginId);
            return false;
        }
        return this.authService.completeLogin(input, loginId);
    }

    protected async signOut(): Promise<void> {
        const generation = this.authGeneration;
        const confirmed = await new ConfirmDialog({
            title: nls.localize('theia/ai/chatgpt/signOutTitle', 'Sign out of ChatGPT'),
            msg: nls.localize('theia/ai/chatgpt/signOutConfirm', 'Are you sure you want to sign out of ChatGPT?'),
            ok: Dialog.YES,
            cancel: Dialog.NO
        }).open();
        if (confirmed && !this.disposed && generation === this.authGeneration) {
            await this.authService.signOut();
        }
    }
}
