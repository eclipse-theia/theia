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
import { MaybePromise, nls } from '@theia/core';
import { DialogError, DialogMode } from '@theia/core/lib/browser/dialogs';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';

export interface MCPServerInstallParameters {
    /** Whether the server should autostart. Defaults to true if the dialog isn't shown. */
    autostart: boolean;
    /** Authentication token entered by the user; only collected for remote servers that need one. */
    serverAuthToken?: string;
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

    constructor(protected readonly options: MCPServerInstallDialogOptions) {
        super({
            title: nls.localize('theia/ai-mcp/installDialog/title', 'Install MCP Server'),
            maxWidth: 460
        });
        this.autostart = options.autostart ?? true;
        this.appendCloseButton(nls.localizeByDefault('Cancel'));
        this.appendAcceptButton(nls.localizeByDefault('Install'));
    }

    get value(): MCPServerInstallParameters | undefined {
        return {
            autostart: this.autostart,
            ...(this.options.requireAuthToken && this.serverAuthToken.trim()
                ? { serverAuthToken: this.serverAuthToken.trim() }
                : {})
        };
    }

    /**
     * Guard the auth-token field: when the server requires a token, an empty value must
     * block the install. Otherwise the registry-supplied placeholder (e.g.
     * `<github-pat-or-app-token>`) would survive into settings.json and the server would
     * fail later with an opaque error.
     */
    protected override isValid(_value: MCPServerInstallParameters | undefined, _mode: DialogMode): MaybePromise<DialogError> {
        if (this.options.requireAuthToken && !this.serverAuthToken.trim()) {
            return nls.localize(
                'theia/ai-mcp/installDialog/authTokenRequired',
                'An auth token is required to install this server.'
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
