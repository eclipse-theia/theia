// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core';
import { KeyStoreService } from '@theia/core/lib/common/key-store';

/**
 * The credentials of the GitHub Copilot sign-in, as stored by {@link CopilotCredentialStore}.
 */
export interface CopilotCredentials {
    /** The GitHub token the Copilot CLI is given for its requests. */
    token: string;
    /** The GitHub login the token belongs to, for display purposes. */
    accountLabel?: string;
    /** The GitHub Enterprise domain the sign-in was performed against, if any. */
    enterpriseUrl?: string;
}

/**
 * Where the Copilot credentials of this application are kept.
 *
 * The credentials are held by the application rather than by the Copilot CLI, so that signing out
 * only has to remove this entry and never has to touch credentials of the user's machine, such as
 * their system keyring entries or their GitHub CLI sign-in.
 */
@injectable()
export class CopilotCredentialStore {

    /** The keystore service name the credentials are stored under. */
    static readonly SERVICE = 'theia-copilot';
    /** The keystore account name the credentials are stored under. */
    static readonly ACCOUNT = 'github-copilot';
    /**
     * The keystore service name the previous integration stored its OAuth token under.
     *
     * That token belonged to an OAuth application that is no longer used, so it is useless, and the
     * code that could remove it is gone. It is therefore cleaned up once, rather than left behind on
     * the machine of the user.
     */
    static readonly LEGACY_SERVICE = 'theia-copilot-auth';

    @inject(KeyStoreService)
    protected readonly keyStoreService: KeyStoreService;

    @inject(ILogger) @named('ai-copilot:CopilotCredentialStore')
    protected readonly logger: ILogger;

    async get(): Promise<CopilotCredentials | undefined> {
        try {
            const stored = await this.keyStoreService.getPassword(CopilotCredentialStore.SERVICE, CopilotCredentialStore.ACCOUNT);
            if (stored) {
                const credentials = JSON.parse(stored) as CopilotCredentials;
                return credentials.token ? credentials : undefined;
            }
        } catch (error) {
            this.logger.warn('Copilot: failed to read the stored credentials:', error);
        }
        return undefined;
    }

    async set(credentials: CopilotCredentials): Promise<void> {
        await this.keyStoreService.setPassword(CopilotCredentialStore.SERVICE, CopilotCredentialStore.ACCOUNT, JSON.stringify(credentials));
    }

    /**
     * Removes the credentials of the previous integration, if any are still present.
     * @returns whether something was removed, so that the user can be told why they are signed out
     */
    async deleteLegacy(): Promise<boolean> {
        try {
            return await this.keyStoreService.deletePassword(CopilotCredentialStore.LEGACY_SERVICE, CopilotCredentialStore.ACCOUNT);
        } catch (error) {
            this.logger.warn('Copilot: failed to delete the credentials of the previous integration:', error);
            return false;
        }
    }

    async delete(): Promise<void> {
        try {
            await this.keyStoreService.deletePassword(CopilotCredentialStore.SERVICE, CopilotCredentialStore.ACCOUNT);
        } catch (error) {
            this.logger.warn('Copilot: failed to delete the stored credentials:', error);
        }
    }
}
