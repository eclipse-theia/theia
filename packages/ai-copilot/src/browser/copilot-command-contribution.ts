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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, Disposable, DisposableCollection, nls, PreferenceService } from '@theia/core';
import { ConfirmDialog, Dialog } from '@theia/core/lib/browser';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { CopilotAuthService, CopilotAuthState } from '../common/copilot-auth-service';
import { CopilotAuthDialog, CopilotAuthDialogProps } from './copilot-auth-dialog';
import { COPILOT_ENTERPRISE_URL_PREF } from '../common/copilot-preferences';

export namespace CopilotCommands {
    export const SIGN_IN: Command = Command.toLocalizedCommand(
        { id: 'copilot.signIn', label: 'Sign in to GitHub Copilot', category: 'Copilot' },
        'theia/ai/copilot/commands/signIn',
        'theia/ai/copilot/category'
    );

    export const SIGN_OUT: Command = Command.toLocalizedCommand(
        { id: 'copilot.signOut', label: 'Sign out of GitHub Copilot', category: 'Copilot' },
        'theia/ai/copilot/commands/signOut',
        'theia/ai/copilot/category'
    );
}

/**
 * Command contribution for GitHub Copilot authentication commands.
 */
@injectable()
export class CopilotCommandContribution implements CommandContribution, Disposable {

    @inject(CopilotAuthService)
    protected readonly authService: CopilotAuthService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    @inject(CopilotAuthDialogProps)
    protected readonly dialogProps: CopilotAuthDialogProps;

    @inject(CopilotAuthDialog)
    protected readonly authDialog: CopilotAuthDialog;

    protected authState: CopilotAuthState = { isAuthenticated: false };
    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.authService.getAuthState().then(state => {
            this.authState = state;
        });

        this.toDispose.push(this.authService.onAuthStateChanged(state => {
            this.authState = state;
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(CopilotCommands.SIGN_IN, {
            execute: async () => {
                const enterpriseUrl = this.preferenceService.get<string>(COPILOT_ENTERPRISE_URL_PREF);
                this.dialogProps.enterpriseUrl = enterpriseUrl || undefined;
                const result = await this.authDialog.open();
                if (result) {
                    this.authState = await this.authService.getAuthState();
                }
            },
            isEnabled: () => !this.authState.isAuthenticated,
            isVisible: () => this.activationService.isActive
        });

        registry.registerCommand(CopilotCommands.SIGN_OUT, {
            execute: async () => {
                const confirmed = await new ConfirmDialog({
                    title: nls.localize('theia/ai/copilot/commands/signOut', 'Sign out of GitHub Copilot'),
                    msg: nls.localize('theia/ai/copilot/signOut/confirmMessage', 'Are you sure you want to sign out of GitHub Copilot?'),
                    ok: Dialog.YES,
                    cancel: Dialog.NO
                }).open();
                if (confirmed) {
                    await this.authService.signOut();
                }
            },
            isEnabled: () => this.authState.isAuthenticated,
            isVisible: () => this.activationService.isActive
        });
    }
}
