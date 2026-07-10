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

import * as React from '@theia/core/shared/react';
import { Disposable, MaybePromise, nls } from '@theia/core';
import { DialogError, DialogMode } from '@theia/core/lib/browser/dialogs';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';

export interface MCPServerInstallParameters {
    /** Whether the server should autostart. Defaults to true if the dialog isn't shown. */
    autostart: boolean;
    /** Authentication token entered by the user; only collected for remote servers that need one. */
    serverAuthToken?: string;
    /** OAuth client id entered by the user; only collected for servers that advertise OAuth. */
    oauthClientId?: string;
    /** OAuth client secret entered by the user; only collected for servers that advertise OAuth. */
    oauthClientSecret?: string;
}

/**
 * Trust signal rendered as a banner at the top of the install dialog. Lets the user see
 * whether the install they're about to perform is approved by the configured AI registry.
 *
 * - `verified`     - registry is configured and lists this server
 * - `unverified`   - registry is configured but does NOT list this server
 * - `no-registry`  - no registry is configured, so trust can't be assessed
 */
export type MCPServerInstallTrust =
    | { readonly status: 'verified'; readonly serverId: string }
    | { readonly status: 'unverified'; readonly serverId: string }
    | { readonly status: 'no-registry' };

export interface MCPServerInstallDialogOptions {
    /** Server name as it will be saved into the preference (read-only, shown to the user). */
    readonly name: string;
    /** Initial autostart value (typically `true`). */
    readonly autostart?: boolean;
    /** Whether to show the auth-token field; set when the entry advertises an auth token slot. */
    readonly requireAuthToken?: boolean;
    /**
     * Whether to show the OAuth client-id / client-secret fields; set when the entry advertises an
     * `oauth` block. Only the confidential-client credentials and the (read-only) redirect URL are
     * surfaced - scopes, authorization server and resource stay fixed by the registry.
     */
    readonly requireOAuth?: boolean;
    /** When set, renders a trust banner explaining the registry approval status. */
    readonly trust?: MCPServerInstallTrust;
}

/**
 * Factory for the {@link MCPServerInstallDialog}. Injected so the registry install actions
 * and the `install-mcp` URL handler construct the dialog through dependency injection
 * rather than importing it directly, and so adopters can rebind the dialog if needed.
 */
export const MCPServerInstallDialogFactory = Symbol('MCPServerInstallDialogFactory');
export type MCPServerInstallDialogFactory = (options: MCPServerInstallDialogOptions) => MCPServerInstallDialog;

/**
 * Lightweight install confirmation dialog. Distinct from `MCPServerDialog` because the
 * user can't rename a server picked from the registry and the rest of the config comes
 * from the registry entry - we only need to collect the truly user-supplied parameters
 * (autostart and, when relevant, an auth token).
 */
export class MCPServerInstallDialog extends ReactDialog<MCPServerInstallParameters | undefined> {

    protected autostart: boolean;
    protected serverAuthToken: string = '';
    protected oauthClientId: string = '';
    protected oauthClientSecret: string = '';

    /** Resolved OAuth redirect URL shown read-only so the user can register it with their provider. */
    protected oauthRedirectUrl: string | undefined;
    protected oauthRedirectUrlRequested = false;
    protected redirectUrlCopied = false;

    constructor(
        protected readonly options: MCPServerInstallDialogOptions,
        protected readonly redirectUrlProvider?: () => Promise<string>
    ) {
        super({
            title: nls.localize('theia/ai-mcp/installDialog/title', 'Install MCP Server'),
            maxWidth: 460
        });
        this.autostart = options.autostart ?? true;
        this.appendCloseButton(nls.localizeByDefault('Cancel'));
        this.appendAcceptButton(nls.localizeByDefault('Install'));
        // Kick off the OAuth redirect URL resolution lazily after construction (rather than from
        // `render()`, which must stay free of state-mutating side effects).
        if (this.options.requireOAuth) {
            this.ensureOAuthRedirectUrl();
        }
    }

    get value(): MCPServerInstallParameters | undefined {
        return {
            autostart: this.autostart,
            ...(this.options.requireAuthToken && this.serverAuthToken.trim()
                ? { serverAuthToken: this.serverAuthToken.trim() }
                : {}),
            ...(this.options.requireOAuth && this.oauthClientId.trim()
                ? { oauthClientId: this.oauthClientId.trim() }
                : {}),
            ...(this.options.requireOAuth && this.oauthClientSecret.trim()
                ? { oauthClientSecret: this.oauthClientSecret.trim() }
                : {})
        };
    }

    /**
     * Guard the credential fields: when the server requires them, empty values must block the
     * install. Otherwise the registry-supplied placeholders (e.g. `<github-pat-or-app-token>`,
     * `<clientId>`) would survive into settings.json and the server would fail later with an
     * opaque error.
     */
    protected override isValid(_value: MCPServerInstallParameters | undefined, _mode: DialogMode): MaybePromise<DialogError> {
        if (this.options.requireAuthToken && !this.serverAuthToken.trim()) {
            return nls.localize(
                'theia/ai-mcp/installDialog/authTokenRequired',
                'An auth token is required to install this server.'
            );
        }
        if (this.options.requireOAuth && (!this.oauthClientId.trim() || !this.oauthClientSecret.trim())) {
            return nls.localize(
                'theia/ai-mcp/installDialog/oauthCredentialsRequired',
                'An OAuth client ID and client secret are required to install this server.'
            );
        }
        return '';
    }

    protected handleAutostartChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.autostart = e.target.checked;
        this.update();
    };

    protected handleAuthTokenChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.serverAuthToken = e.target.value;
        this.update();
    };

    protected handleClientIdChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.oauthClientId = e.target.value;
        this.update();
    };

    protected handleClientSecretChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.oauthClientSecret = e.target.value;
        this.update();
    };

    /**
     * Resolves the OAuth redirect URL once (through the backend, which knows whether the Electron
     * loopback callback server overrides the frontend origin) so the user can register it with
     * their OAuth provider.
     */
    protected ensureOAuthRedirectUrl(): void {
        if (this.oauthRedirectUrlRequested || !this.redirectUrlProvider) {
            return;
        }
        this.oauthRedirectUrlRequested = true;
        this.redirectUrlProvider().then(url => {
            if (this.isDisposed) {
                return;
            }
            this.oauthRedirectUrl = url;
            this.update();
        }).catch(error => {
            console.warn('Failed to determine the MCP OAuth redirect URL; the redirect URL hint will not be shown.', error);
        });
    }

    protected handleCopyRedirectUrl = (): void => {
        if (!this.oauthRedirectUrl) {
            return;
        }
        // `writeText` returns a promise; on rejection (e.g. permissions denied, non-secure
        // context) we reset the "copied" indicator so the UI doesn't falsely confirm success.
        navigator.clipboard.writeText(this.oauthRedirectUrl).then(() => {
            if (this.isDisposed) {
                return;
            }
            this.redirectUrlCopied = true;
            this.update();
            const handle = setTimeout(() => {
                this.redirectUrlCopied = false;
                if (!this.isDisposed) {
                    this.update();
                }
            }, 1500);
            this.toDispose.push(Disposable.create(() => clearTimeout(handle)));
        }).catch(error => {
            console.warn('Failed to copy the MCP OAuth redirect URL to the clipboard.', error);
            if (this.isDisposed) {
                return;
            }
            this.redirectUrlCopied = false;
            this.update();
        });
    };

    protected renderTrustBanner(): React.ReactNode {
        const trust = this.options.trust;
        if (!trust) {
            return undefined;
        }
        switch (trust.status) {
            case 'verified':
                return (
                    <div className="mcp-install-trust-banner mcp-install-trust-banner--verified">
                        <i className="codicon codicon-verified-filled" />
                        <span>
                            {nls.localize(
                                'theia/ai-mcp/installDialog/trust/verified',
                                'Approved by your AI registry ({0}).',
                                trust.serverId
                            )}
                        </span>
                    </div>
                );
            case 'unverified':
                return (
                    <div className="mcp-install-trust-banner mcp-install-trust-banner--unverified">
                        <i className="codicon codicon-warning" />
                        <span>
                            {nls.localize(
                                'theia/ai-mcp/installDialog/trust/unverified',
                                'This server is not listed in your AI registry ({0}). Install at your own risk.',
                                trust.serverId
                            )}
                        </span>
                    </div>
                );
            case 'no-registry':
                return (
                    <div className="mcp-install-trust-banner mcp-install-trust-banner--unknown">
                        <i className="codicon codicon-info" />
                        <span>
                            {nls.localize(
                                'theia/ai-mcp/installDialog/trust/unknown',
                                'No AI registry is configured - trust cannot be verified.'
                            )}
                        </span>
                    </div>
                );
        }
    }

    /**
     * Renders the user-settable OAuth credentials (confidential client id + secret) and the
     * read-only redirect URL the user must register with their provider. The remaining OAuth
     * parameters (scopes, authorization server, resource) are fixed by the registry and are not
     * shown here.
     */
    protected renderOAuthFields(): React.ReactNode {
        return (
            <>
                <div className="mcp-form-description">
                    {nls.localize(
                        'theia/ai-mcp/installDialog/oauthDescription',
                        'This server uses OAuth with a pre-registered confidential client. Provide the client ID and secret from your OAuth provider.'
                    )}
                </div>

                {this.oauthRedirectUrl && (
                    <div className="mcp-form-field">
                        <label>{nls.localize('theia/ai/mcpConfiguration/oauthRedirectUrl', 'Redirect URL')}:</label>
                        <div className="mcp-oauth-redirect-url-row">
                            <span className="mcp-form-static-value">{this.oauthRedirectUrl}</span>
                            <button
                                type="button"
                                className="mcp-icon-button"
                                title={nls.localizeByDefault('Copy')}
                                onClick={this.handleCopyRedirectUrl}
                            >
                                <i className={this.redirectUrlCopied ? 'codicon codicon-check' : 'codicon codicon-copy'}></i>
                            </button>
                        </div>
                        <div className="mcp-form-description">
                            {nls.localize(
                                'theia/ai/mcpConfiguration/form/oauthRedirectUrlDescription',
                                'Authorization callbacks are delivered to this URL. With a static client ID, register it as a redirect URI with your OAuth provider.'
                            )}
                        </div>
                    </div>
                )}

                <div className="mcp-form-field">
                    <label>{nls.localize('theia/ai/mcpConfiguration/oauthClientId', 'OAuth Client ID')}:</label>
                    <input
                        type="text"
                        className="theia-input"
                        value={this.oauthClientId}
                        onChange={this.handleClientIdChange}
                        placeholder={nls.localize('theia/ai-mcp/installDialog/oauthClientIdPlaceholder', 'Required by this server to connect')}
                        spellCheck={false}
                        // Only autofocus when the auth-token field above isn't present; otherwise two
                        // inputs would carry `autoFocus` and browser behaviour is undefined.
                        autoFocus={!this.options.requireAuthToken}
                    />
                </div>

                <div className="mcp-form-field">
                    <label>{nls.localize('theia/ai/mcpConfiguration/oauthClientSecret', 'OAuth Client Secret')}:</label>
                    <input
                        type="password"
                        className="theia-input"
                        value={this.oauthClientSecret}
                        onChange={this.handleClientSecretChange}
                        placeholder={nls.localize('theia/ai-mcp/installDialog/oauthClientSecretPlaceholder', 'Required by this server to connect')}
                        spellCheck={false}
                    />
                </div>
            </>
        );
    }

    protected render(): React.ReactNode {
        return (
            <div className="mcp-dialog-form">
                {this.renderTrustBanner()}
                <div className="mcp-form-field">
                    <label>{nls.localize('theia/ai/mcpConfiguration/form/serverName', 'Server Name')}:</label>
                    <span className="mcp-form-static-value">{this.options.name}</span>
                </div>

                {this.options.requireAuthToken && (
                    <div className="mcp-form-field">
                        <label>{nls.localize('theia/ai/mcpConfiguration/serverAuthToken', 'Auth Token')}:</label>
                        <input
                            type="password"
                            className="theia-input"
                            value={this.serverAuthToken}
                            onChange={this.handleAuthTokenChange}
                            placeholder={nls.localize(
                                'theia/ai-mcp/installDialog/authTokenPlaceholder',
                                'Required by this server to connect'
                            )}
                            spellCheck={false}
                            autoFocus
                        />
                    </div>
                )}

                {this.options.requireOAuth && this.renderOAuthFields()}

                <div className="mcp-form-field mcp-form-checkbox">
                    <label>
                        <input
                            type="checkbox"
                            className="theia-input"
                            checked={this.autostart}
                            onChange={this.handleAutostartChange}
                        />
                        {nls.localize('theia/ai/mcpConfiguration/form/autostart', 'Autostart')}
                    </label>
                </div>
            </div>
        );
    }
}
