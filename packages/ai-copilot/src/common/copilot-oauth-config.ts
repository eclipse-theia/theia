// *****************************************************************************
// Copyright (C) 2026 Lonti.com Pty Ltd.
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

export const CopilotOAuthConfig = Symbol('CopilotOAuthConfig');

/**
 * Configuration for the GitHub Copilot OAuth Device Flow.
 * Bind this symbol to a custom value in your container module to override the defaults
 * and use your own GitHub OAuth application.
 */
export interface CopilotOAuthConfig {
    /**
     * The GitHub OAuth App client ID used to initiate the device flow.
     * Defaults to the built-in Theia Copilot OAuth App client ID.
     */
    readonly clientId: string;
    /**
     * The User-Agent header sent with GitHub API requests.
     * Defaults to {@link COPILOT_USER_AGENT}.
     */
    readonly userAgent: string;
    /**
     * The service name used to store credentials in the system keystore.
     * Defaults to `'theia-copilot-auth'`.
     */
    readonly keystoreService: string;
    /**
     * The account name used to store credentials in the system keystore.
     * Defaults to `'github-copilot'`.
     */
    readonly keystoreAccount: string;
}

/**
 * Default OAuth configuration for the built-in Theia Copilot integration.
 */
export const DEFAULT_COPILOT_OAUTH_CONFIG: CopilotOAuthConfig = {
    clientId: 'Ov23liS2vINy9VOAweyv',
    userAgent: 'Theia-Copilot/1.0.0',
    keystoreService: 'theia-copilot-auth',
    keystoreAccount: 'github-copilot'
};
