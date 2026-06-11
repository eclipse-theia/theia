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
import { nls } from '@theia/core';
import { DialogProps } from '@theia/core/lib/browser/dialogs';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import { SelectComponent } from '@theia/core/lib/browser/widgets/select-component';
import { isHttpOrHttpsUrl } from '../common/mcp-server-preference-validator';

/** Server type edited in the dialog: local stdio launch, remote URL with token authentication, or remote URL with OAuth. */
export type MCPServerType = 'local' | 'remote' | 'remote-oauth';

/** User-facing form fields collected by the Add/Edit MCP Server dialog. */
export interface MCPServerFormData {
    name: string;
    serverType: MCPServerType;
    command: string;
    args: string;
    env: string;
    serverUrl: string;
    serverAuthToken: string;
    serverAuthTokenHeader: string;
    headers: string;
    oauthClientId: string;
    oauthClientSecret: string;
    oauthScopes: string;
    oauthAuthorizationServer: string;
    oauthResource: string;
    autostart: boolean;
}

export const DEFAULT_MCP_SERVER_FORM_DATA: MCPServerFormData = {
    name: '',
    serverType: 'local',
    command: '',
    args: '',
    env: '',
    serverUrl: '',
    serverAuthToken: '',
    serverAuthTokenHeader: '',
    headers: '',
    oauthClientId: '',
    oauthClientSecret: '',
    oauthScopes: '',
    oauthAuthorizationServer: '',
    oauthResource: '',
    autostart: true
};

/**
 * Dialog for adding or editing an MCP server. Kept in a separate module from
 * `MCPServerEditor` so importing the editor doesn't pull in the DOM-touching
 * `ReactDialog` chain - important for unit tests that load the editor's types.
 */
export class MCPServerEditDialog extends ReactDialog<MCPServerFormData | undefined> {

    protected formData: MCPServerFormData;
    protected existingServerNames: string[];
    protected isEditing: boolean;
    protected readonly redirectUrlProvider?: () => Promise<string>;

    /** The OAuth redirect URL displayed in the OAuth section; resolved lazily on first render of that section. */
    protected oauthRedirectUrl?: string;
    protected oauthRedirectUrlRequested = false;
    protected redirectUrlCopied = false;

    constructor(
        props: DialogProps,
        initialData: MCPServerFormData,
        existingServerNames: string[],
        isEditing: boolean,
        redirectUrlProvider?: () => Promise<string>
    ) {
        super(props);
        this.formData = { ...initialData };
        this.existingServerNames = existingServerNames;
        this.isEditing = isEditing;
        this.redirectUrlProvider = redirectUrlProvider;
        this.appendCloseButton(nls.localizeByDefault('Cancel'));
        this.appendAcceptButton(isEditing
            ? nls.localize('theia/ai/mcpConfiguration/form/saveChanges', 'Save Changes')
            : nls.localizeByDefault('Add Server'));
    }

    get value(): MCPServerFormData | undefined {
        return this.formData;
    }

    protected override isValid(): string {
        const errors: string[] = [];
        if (!this.formData.name.trim()) {
            errors.push(nls.localize('theia/ai/mcpConfiguration/form/nameRequired', 'Server name is required'));
        } else if (!this.isEditing && this.existingServerNames.includes(this.formData.name.trim())) {
            errors.push(nls.localize('theia/ai/mcpConfiguration/form/nameExists', 'A server with this name already exists'));
        }
        if (this.formData.serverType === 'local') {
            if (!this.formData.command.trim()) {
                errors.push(nls.localize('theia/ai/mcpConfiguration/form/commandRequired', 'Command is required for local servers'));
            }
        } else if (!this.formData.serverUrl.trim()) {
            errors.push(nls.localize('theia/ai/mcpConfiguration/form/serverUrlRequired', 'Server URL is required for remote servers'));
        } else if (this.formData.serverType === 'remote-oauth') {
            const authorizationServer = this.formData.oauthAuthorizationServer.trim();
            if (authorizationServer && !isHttpOrHttpsUrl(authorizationServer)) {
                errors.push(nls.localize('theia/ai/mcpConfiguration/form/oauthAuthorizationServerInvalid',
                    'OAuth Authorization Server must be a valid http(s) URL'));
            }
            const resource = this.formData.oauthResource.trim();
            if (resource && !isHttpOrHttpsUrl(resource)) {
                errors.push(nls.localize('theia/ai/mcpConfiguration/form/oauthResourceInvalid',
                    'OAuth Resource must be a valid http(s) URL'));
            }
        }
        return errors.join('. ');
    }

    protected handleFormChange = (field: keyof MCPServerFormData, value: string | boolean): void => {
        this.formData = { ...this.formData, [field]: value };
        this.update();
    };

    protected render(): React.ReactNode {
        return (
            <div className="mcp-dialog-form">
                <div className="mcp-form-field">
                    <label>{nls.localize('theia/ai/mcpConfiguration/form/serverName', 'Server Name')}:</label>
                    <input
                        type="text"
                        className="theia-input"
                        value={this.formData.name}
                        onChange={e => this.handleFormChange('name', e.target.value)}
                        placeholder={nls.localize('theia/ai/mcpConfiguration/form/serverNamePlaceholder', 'e.g., my-mcp-server')}
                        disabled={this.isEditing}
                        spellCheck={false}
                    />
                </div>

                <div className="mcp-form-field">
                    <label>{nls.localize('theia/ai/mcpConfiguration/form/serverType', 'Server Type')}:</label>
                    <SelectComponent
                        className="theia-select"
                        defaultValue={this.formData.serverType}
                        options={[
                            { value: 'local', label: nls.localize('theia/ai/mcpConfiguration/form/localServer', 'Local (Command)') },
                            { value: 'remote', label: nls.localize('theia/ai/mcpConfiguration/form/remoteServer', 'Remote (URL)') },
                            { value: 'remote-oauth', label: nls.localize('theia/ai/mcpConfiguration/form/remoteOAuthServer', 'Remote (OAuth)') }
                        ]}
                        onChange={option => this.handleFormChange('serverType', option.value as MCPServerType)}
                    />
                </div>

                {this.formData.serverType === 'local' ? this.renderLocalServerFields() : this.renderRemoteServerFields()}

                <div className="mcp-form-field mcp-form-checkbox">
                    <label>
                        <input
                            type="checkbox"
                            className='theia-input'
                            checked={this.formData.autostart}
                            onChange={e => this.handleFormChange('autostart', e.target.checked)}
                        />
                        {nls.localize('theia/ai/mcpConfiguration/form/autostart', 'Autostart')}
                    </label>
                </div>
            </div>
        );
    }

    protected renderLocalServerFields(): React.ReactNode {
        return (
            <>
                <div className="mcp-form-field">
                    <label>{nls.localizeByDefault('Command')}:</label>
                    <input
                        type="text"
                        className="theia-input"
                        value={this.formData.command}
                        onChange={e => this.handleFormChange('command', e.target.value)}
                        placeholder={nls.localize('theia/ai/mcpConfiguration/form/commandPlaceholder', 'e.g., npx or uvx')}
                        spellCheck={false}
                    />
                </div>

                <div className="mcp-form-field">
                    <label>{nls.localizeByDefault('Arguments')}:</label>
                    <input
                        type="text"
                        className="theia-input"
                        value={this.formData.args}
                        onChange={e => this.handleFormChange('args', e.target.value)}
                        placeholder={nls.localize('theia/ai/mcpConfiguration/form/argsPlaceholder', 'Space-separated, e.g., -y @modelcontextprotocol/server-brave-search')}
                        spellCheck={false}
                    />
                </div>

                <div className="mcp-form-field">
                    <label>{nls.localize('theia/ai/mcpConfiguration/environmentVariables', 'Environment Variables')}:</label>
                    <textarea
                        className="theia-input"
                        value={this.formData.env}
                        onChange={e => this.handleFormChange('env', e.target.value)}
                        placeholder={nls.localize('theia/ai/mcpConfiguration/form/envPlaceholder', 'KEY=value (one per line)')}
                        rows={3}
                        spellCheck={false}
                    />
                </div>
            </>
        );
    }

    /**
     * Kicks off resolving the OAuth redirect URL once. Resolved through the backend because only it
     * knows whether the Electron loopback callback server overrides the frontend's origin-based URL.
     */
    protected ensureOAuthRedirectUrl(): void {
        if (this.oauthRedirectUrlRequested || !this.redirectUrlProvider) {
            return;
        }
        this.oauthRedirectUrlRequested = true;
        this.redirectUrlProvider().then(url => {
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
        navigator.clipboard.writeText(this.oauthRedirectUrl);
        this.redirectUrlCopied = true;
        this.update();
        setTimeout(() => {
            this.redirectUrlCopied = false;
            if (!this.isDisposed) {
                this.update();
            }
        }, 1500);
    };

    protected renderRemoteServerFields(): React.ReactNode {
        if (this.formData.serverType === 'remote-oauth') {
            this.ensureOAuthRedirectUrl();
        }
        return (
            <>
                <div className="mcp-form-field">
                    <label>{nls.localize('theia/ai/mcpConfiguration/serverUrl', 'Server URL')}:</label>
                    <input
                        type="text"
                        className="theia-input"
                        value={this.formData.serverUrl}
                        onChange={e => this.handleFormChange('serverUrl', e.target.value)}
                        placeholder={nls.localize('theia/ai/mcpConfiguration/form/serverUrlPlaceholder', 'e.g., https://mcp.example.com')}
                        spellCheck={false}
                    />
                </div>

                {this.formData.serverType === 'remote' && (
                    <>
                        <div className="mcp-form-field">
                            <label>{nls.localize('theia/ai/mcpConfiguration/serverAuthToken', 'Auth Token')}:</label>
                            <input
                                type="password"
                                className="theia-input"
                                value={this.formData.serverAuthToken}
                                onChange={e => this.handleFormChange('serverAuthToken', e.target.value)}
                                placeholder={nls.localize('theia/ai/mcpConfiguration/form/authTokenPlaceholder', 'Optional authentication token')}
                                spellCheck={false}
                            />
                        </div>

                        <div className="mcp-form-field">
                            <label>{nls.localize('theia/ai/mcpConfiguration/serverAuthTokenHeader', 'Auth Header Name')}:</label>
                            <input
                                type="text"
                                className="theia-input"
                                value={this.formData.serverAuthTokenHeader}
                                onChange={e => this.handleFormChange('serverAuthTokenHeader', e.target.value)}
                                placeholder={nls.localize('theia/ai/mcpConfiguration/form/authHeaderPlaceholder', 'Default: Authorization with Bearer')}
                                spellCheck={false}
                            />
                        </div>
                    </>
                )}

                <div className="mcp-form-field">
                    <label>{nls.localize('theia/ai/mcpConfiguration/headers', 'Headers')}:</label>
                    <textarea
                        className="theia-input"
                        value={this.formData.headers}
                        onChange={e => this.handleFormChange('headers', e.target.value)}
                        placeholder={nls.localize('theia/ai/mcpConfiguration/form/headersPlaceholder', 'Header-Name=value (one per line)')}
                        rows={3}
                        spellCheck={false}
                    />
                </div>

                {this.formData.serverType === 'remote-oauth' && (
                    <>
                        <div className="mcp-form-section-title">
                            {nls.localize('theia/ai/mcpConfiguration/oauth', 'OAuth')}
                        </div>

                        <div className="mcp-form-description">
                            {nls.localize('theia/ai/mcpConfiguration/form/oauthPublicClientDescription',
                                'Theia uses public OAuth clients with PKCE by default. Provide a client secret only if the server requires a pre-registered confidential client.')}
                        </div>
                        <div className="mcp-form-description">
                            {nls.localize('theia/ai/mcpConfiguration/form/oauthSharedCredentialsDescription',
                                'Stored OAuth sessions are shared across workspaces that use the same server name and URL (or resource).')}
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
                                    {nls.localize('theia/ai/mcpConfiguration/form/oauthRedirectUrlDescription',
                                        'Authorization callbacks are delivered to this URL. With a static client ID, register it as a redirect URI with your OAuth provider.')}
                                </div>
                            </div>
                        )}

                        <div className="mcp-form-field">
                            <label>{nls.localize('theia/ai/mcpConfiguration/oauthClientId', 'OAuth Client ID')}:</label>
                            <input
                                type="text"
                                className="theia-input"
                                value={this.formData.oauthClientId}
                                onChange={e => this.handleFormChange('oauthClientId', e.target.value)}
                                placeholder={nls.localize('theia/ai/mcpConfiguration/form/oauthClientIdPlaceholder', 'Optional static client ID')}
                                spellCheck={false}
                            />
                        </div>

                        <div className="mcp-form-field">
                            <label>{nls.localize('theia/ai/mcpConfiguration/oauthClientSecret', 'OAuth Client Secret')}:</label>
                            <input
                                type="password"
                                className="theia-input"
                                value={this.formData.oauthClientSecret}
                                onChange={e => this.handleFormChange('oauthClientSecret', e.target.value)}
                                placeholder={nls.localize('theia/ai/mcpConfiguration/form/oauthClientSecretPlaceholder',
                                    'Only for servers requiring a confidential client')}
                                spellCheck={false}
                            />
                        </div>

                        <div className="mcp-form-field">
                            <label>{nls.localize('theia/ai/mcpConfiguration/oauthScopes', 'OAuth Scopes')}:</label>
                            <input
                                type="text"
                                className="theia-input"
                                value={this.formData.oauthScopes}
                                onChange={e => this.handleFormChange('oauthScopes', e.target.value)}
                                placeholder={nls.localize('theia/ai/mcpConfiguration/form/oauthScopesPlaceholder', 'Space-separated scopes')}
                                spellCheck={false}
                            />
                        </div>

                        <div className="mcp-form-field">
                            <label>{nls.localize('theia/ai/mcpConfiguration/oauthAuthorizationServer', 'Authorization Server')}:</label>
                            <input
                                type="text"
                                className="theia-input"
                                value={this.formData.oauthAuthorizationServer}
                                onChange={e => this.handleFormChange('oauthAuthorizationServer', e.target.value)}
                                placeholder={nls.localize('theia/ai/mcpConfiguration/form/oauthAuthorizationServerPlaceholder', 'Optional authorization server URL')}
                                spellCheck={false}
                            />
                        </div>

                        <div className="mcp-form-field">
                            <label>{nls.localize('theia/ai/mcpConfiguration/oauthResource', 'OAuth Resource')}:</label>
                            <input
                                type="text"
                                className="theia-input"
                                value={this.formData.oauthResource}
                                onChange={e => this.handleFormChange('oauthResource', e.target.value)}
                                placeholder={nls.localize('theia/ai/mcpConfiguration/form/oauthResourcePlaceholder', 'Optional resource URI')}
                                spellCheck={false}
                            />
                        </div>
                    </>
                )}
            </>
        );
    }
}
