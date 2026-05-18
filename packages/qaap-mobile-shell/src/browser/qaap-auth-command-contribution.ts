// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, nls } from '@theia/core/lib/common';
import { readQaapSignedIn } from '@theia/qaap-adapters/lib/browser/qaap-auth-session';
import { QAAP_REQUIRE_LOGIN_EVENT, signOutQaapAuth, startGithubOAuth } from '@theia/qaap-adapters/lib/browser/qaap-github-auth-client';
import { QAAP_AUTH_SIGN_IN_GITHUB_COMMAND, QAAP_AUTH_SIGN_OUT_COMMAND } from './qaap-workbench-account-menu';

@injectable()
export class QaapAuthCommandContribution implements CommandContribution {

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand({
            id: QAAP_AUTH_SIGN_IN_GITHUB_COMMAND,
            label: nls.localize('qaap/accountMenu/signInGithub', 'Sign in with GitHub'),
        }, {
            execute: () => {
                startGithubOAuth();
            },
        });
        registry.registerCommand({
            id: QAAP_AUTH_SIGN_OUT_COMMAND,
            label: nls.localize('qaap/accountMenu/signOut', 'Sign Out'),
        }, {
            isEnabled: () => readQaapSignedIn(),
            execute: async () => {
                await signOutQaapAuth();
                window.dispatchEvent(new CustomEvent(QAAP_REQUIRE_LOGIN_EVENT));
            },
        });
    }
}
