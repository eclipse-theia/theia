// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { ChatSessionSettings, CommonChatSessionSettings } from '@theia/ai-chat';
import { InMemoryResources, URI, nls } from '@theia/core';
import { AbstractDialog, Message } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { flushSync } from '@theia/core/shared/react-dom';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';

export interface SessionSettingsDialogProps {
    initialSettings: ChatSessionSettings | undefined;
}

interface ConfirmationTimeoutSectionProps {
    enabled: boolean;
    timeoutSeconds: number;
    onEnabledChange: (enabled: boolean) => void;
    onTimeoutChange: (seconds: number) => void;
}

const ConfirmationTimeoutSection: React.FC<ConfirmationTimeoutSectionProps> = ({
    enabled,
    timeoutSeconds,
    onEnabledChange,
    onTimeoutChange
}) => (
    <div className="session-settings-confirmation-timeout">
        <div className="session-settings-section-header">
            {nls.localize('theia/ai/session-settings-dialog/confirmationTimeout', 'Confirmation Timeout')}
        </div>
        <div className="session-settings-section-note">
            {nls.localize('theia/ai/session-settings-dialog/confirmationTimeoutNote',
                'Automatically deny tool confirmations after the specified time. Overrides the global preference for this session.')}
        </div>
        <div className="session-settings-checkbox-container">
            <input
                type="checkbox"
                id="confirmation-timeout-enabled"
                checked={enabled}
                onChange={e => onEnabledChange(e.target.checked)}
            />
            <label htmlFor="confirmation-timeout-enabled">
                {nls.localize('theia/ai/session-settings-dialog/enableConfirmationTimeout', 'Enable confirmation timeout')}
            </label>
        </div>
        <div className="session-settings-timeout-container">
            <label
                htmlFor="confirmation-timeout-seconds"
                className={!enabled ? 'disabled' : ''}
            >
                {nls.localize('theia/ai/session-settings-dialog/timeoutSeconds', 'Timeout (seconds):')}
            </label>
            <input
                type="number"
                id="confirmation-timeout-seconds"
                min={1}
                max={300}
                step={1}
                value={timeoutSeconds}
                placeholder="10"
                disabled={!enabled}
                onChange={e => onTimeoutChange(parseInt(e.target.value, 10))}
            />
        </div>
    </div>
);

interface AdvancedSettingsSectionProps {
    sectionHeader: string;
}

const AdvancedSettingsSection: React.FC<AdvancedSettingsSectionProps> = ({ sectionHeader }) => (
    <div className="session-settings-advanced">
        <div className="session-settings-section-header">
            {sectionHeader}
        </div>
        {/* Editor container will be appended here via DOM manipulation */}
    </div>
);

interface ErrorMessageProps {
    message: string;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => (
    <div className="session-settings-error">{message}</div>
);

interface DialogContentProps {
    confirmationTimeoutEnabled: boolean;
    confirmationTimeoutSeconds: number;
    errorMessage: string;
    onConfirmationTimeoutEnabledChange: (enabled: boolean) => void;
    onConfirmationTimeoutSecondsChange: (seconds: number) => void;
}

const DialogContent: React.FC<DialogContentProps> = ({
    confirmationTimeoutEnabled,
    confirmationTimeoutSeconds,
    errorMessage,
    onConfirmationTimeoutEnabledChange,
    onConfirmationTimeoutSecondsChange
}) => (
    <div className="session-settings-container">
        <ConfirmationTimeoutSection
            enabled={confirmationTimeoutEnabled}
            timeoutSeconds={confirmationTimeoutSeconds}
            onEnabledChange={onConfirmationTimeoutEnabledChange}
            onTimeoutChange={onConfirmationTimeoutSecondsChange}
        />
        <AdvancedSettingsSection
            sectionHeader={nls.localize('theia/ai/session-settings-dialog/advancedSettings', 'Advanced Settings (JSON)')}
        />
        <ErrorMessage message={errorMessage} />
    </div>
);

export class SessionSettingsDialog extends AbstractDialog<ChatSessionSettings> {
    protected jsonEditor: MonacoEditor | undefined;
    protected settings: ChatSessionSettings = {};
    protected initialAdvancedSettingsString: string;
    protected errorMessage: string = '';

    protected confirmationTimeoutEnabled: boolean;
    protected confirmationTimeoutSeconds: number;

    protected preservedReasoning: CommonChatSessionSettings['reasoning'];

    protected contentRoot: Root;
    protected editorContainerNode: HTMLDivElement;

    constructor(
        protected readonly editorProvider: MonacoEditorProvider,
        protected readonly resources: InMemoryResources,
        protected readonly uri: URI,
        protected readonly options: SessionSettingsDialogProps
    ) {
        super({
            title: nls.localize('theia/ai/session-settings-dialog/title', 'Set Session Settings')
        });

        const initialSettings = options.initialSettings;
        this.settings = initialSettings ? { ...initialSettings } : {};

        // Reasoning is edited in the chat input; preserve it across this dialog.
        this.preservedReasoning = this.settings.commonSettings?.reasoning;

        // Extract confirmation timeout settings from commonSettings
        const savedTimeout = this.settings.commonSettings?.confirmationTimeout;
        this.confirmationTimeoutEnabled = savedTimeout !== undefined && savedTimeout > 0;
        this.confirmationTimeoutSeconds = savedTimeout !== undefined && savedTimeout > 0 ? savedTimeout : 10;

        // Prepare advanced settings (exclude commonSettings from the JSON editor)
        const { commonSettings, ...advancedSettings } = initialSettings ?? {};
        this.initialAdvancedSettingsString = JSON.stringify(advancedSettings, undefined, 2);

        this.contentNode.classList.add('monaco-session-settings-dialog');

        // Create React root for content
        this.contentRoot = createRoot(this.contentNode);

        // Pre-create the editor container (will be moved into React tree after render)
        this.editorContainerNode = document.createElement('div');
        this.editorContainerNode.className = 'session-settings-editor-container';

        this.appendCloseButton(nls.localizeByDefault('Cancel'));
        this.appendAcceptButton(nls.localizeByDefault('Apply'));
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        // flushSync ensures React commits the render synchronously so that
        // attachEditorContainer can query the DOM immediately afterwards.
        // Without this, React 18 may defer the commit when invoked outside a
        // browser event handler (e.g. from an Electron IPC callback from an
        // Electron-rendered native menu), causing attachEditorContainer to
        // find no .session-settings-advanced element and the Monaco editor
        // to initialize inside a detached, zero-size node.
        flushSync(() => this.render());
        this.attachEditorContainer();
        this.createJsonEditor();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        if (this.jsonEditor) {
            this.jsonEditor.focus();
        }
    }

    protected override onCloseRequest(msg: Message): void {
        super.onCloseRequest(msg);
        this.contentRoot.unmount();
    }

    protected render(): void {
        this.contentRoot.render(
            <DialogContent
                confirmationTimeoutEnabled={this.confirmationTimeoutEnabled}
                confirmationTimeoutSeconds={this.confirmationTimeoutSeconds}
                errorMessage={this.errorMessage}
                onConfirmationTimeoutEnabledChange={this.handleConfirmationTimeoutEnabledChange}
                onConfirmationTimeoutSecondsChange={this.handleConfirmationTimeoutSecondsChange}
            />
        );
    }

    protected attachEditorContainer(): void {
        // Find the advanced section and append the editor container
        const advancedSection = this.contentNode.querySelector('.session-settings-advanced');
        if (advancedSection && !advancedSection.contains(this.editorContainerNode)) {
            advancedSection.appendChild(this.editorContainerNode);
        }
    }

    protected async createJsonEditor(): Promise<void> {
        this.resources.update(this.uri, this.initialAdvancedSettingsString);
        try {
            const editor = await this.editorProvider.createInline(this.uri, this.editorContainerNode, {
                language: 'json',
                automaticLayout: false,
                minimap: {
                    enabled: false
                },
                scrollBeyondLastLine: false,
                folding: true,
                lineNumbers: 'on',
                fontSize: 13,
                wordWrap: 'on',
                renderValidationDecorations: 'on',
                scrollbar: {
                    vertical: 'auto',
                    horizontal: 'auto'
                }
            });

            editor.getControl().onDidChangeModelContent(() => {
                this.validateJson();
            });
            editor.document.textEditorModel.setValue(this.initialAdvancedSettingsString);

            this.jsonEditor = editor;

            // Manually trigger layout after editor is created
            // Use requestAnimationFrame to ensure the container has been laid out
            requestAnimationFrame(() => this.layoutEditor());

            this.validateJson();
        } catch (error) {
            console.error('Failed to create JSON editor:', error);
        }
    }

    protected layoutEditor(): void {
        if (this.jsonEditor) {
            const containerWidth = this.editorContainerNode.clientWidth;
            const containerHeight = this.editorContainerNode.clientHeight;
            if (containerWidth > 0 && containerHeight > 0) {
                this.jsonEditor.getControl().layout({ width: containerWidth, height: containerHeight });
            }
        }
    }

    protected validateJson(): void {
        if (!this.jsonEditor) {
            return;
        }

        const jsonContent = this.jsonEditor.getControl().getValue();

        try {
            const advancedSettings = JSON.parse(jsonContent);
            this.updateSettings(advancedSettings);
            this.errorMessage = '';
            this.setErrorButtonState(false);
        } catch (error) {
            this.errorMessage = `${error}`;
            this.setErrorButtonState(true);
        }
        this.render();
        this.attachEditorContainer();
    }

    protected updateSettings(advancedSettings: { [key: string]: unknown } = {}): void {
        this.settings = { ...advancedSettings };
        this.updateSettingsFromCommonSettings();
    }

    protected setErrorButtonState(isError: boolean): void {
        const acceptButton = this.acceptButton;
        if (acceptButton) {
            acceptButton.disabled = isError;
            if (isError) {
                acceptButton.classList.add('disabled');
            } else {
                acceptButton.classList.remove('disabled');
            }
        }
    }

    protected handleConfirmationTimeoutEnabledChange = (enabled: boolean): void => {
        this.confirmationTimeoutEnabled = enabled;
        this.updateSettingsFromCommonSettings();
        this.render();
        this.attachEditorContainer();
    };

    protected handleConfirmationTimeoutSecondsChange = (seconds: number): void => {
        this.confirmationTimeoutSeconds = seconds;
        this.updateSettingsFromCommonSettings();
        this.render();
        this.attachEditorContainer();
    };

    protected updateSettingsFromCommonSettings(): void {
        const commonSettings: CommonChatSessionSettings = {};
        if (this.preservedReasoning) {
            commonSettings.reasoning = this.preservedReasoning;
        }
        if (this.confirmationTimeoutEnabled && !isNaN(this.confirmationTimeoutSeconds) && this.confirmationTimeoutSeconds > 0) {
            commonSettings.confirmationTimeout = this.confirmationTimeoutSeconds;
        }
        this.settings.commonSettings = Object.keys(commonSettings).length > 0 ? commonSettings : undefined;
    }

    get value(): ChatSessionSettings {
        return this.settings;
    }
}
