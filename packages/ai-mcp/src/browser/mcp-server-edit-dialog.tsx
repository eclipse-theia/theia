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

/** Server type discriminator the dialog edits - stdio launch vs remote URL. */
export type MCPServerType = 'local' | 'remote';

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

    constructor(
        props: DialogProps,
        initialData: MCPServerFormData,
        existingServerNames: string[],
        isEditing: boolean
    ) {
        super(props);
        this.formData = { ...initialData };
        this.existingServerNames = existingServerNames;
        this.isEditing = isEditing;
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
                            { value: 'remote', label: nls.localize('theia/ai/mcpConfiguration/form/remoteServer', 'Remote (URL)') }
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

    protected renderRemoteServerFields(): React.ReactNode {
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
            </>
        );
    }
}
