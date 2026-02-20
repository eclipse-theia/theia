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

import { ChatSessionSettings } from '@theia/ai-chat';
import { InMemoryResources, URI, nls } from '@theia/core';
import { AbstractDialog, Message } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';

export interface SessionSettingsDialogProps {
    initialSettings: ChatSessionSettings | undefined;
}

interface ThinkingModeSectionProps {
    enabled: boolean;
    budgetTokens: number;
    onEnabledChange: (enabled: boolean) => void;
    onBudgetChange: (budget: number) => void;
}

const ThinkingModeSection: React.FC<ThinkingModeSectionProps> = ({
    enabled,
    budgetTokens,
    onEnabledChange,
    onBudgetChange
}) => (
    <div className="session-settings-thinking-mode">
        <div className="session-settings-section-header">
            {nls.localize('theia/ai/session-settings-dialog/thinkingMode', 'Thinking Mode')}
        </div>
        <div className="session-settings-checkbox-container">
            <input
                type="checkbox"
                id="thinking-enabled"
                checked={enabled}
                onChange={e => onEnabledChange(e.target.checked)}
            />
            <label htmlFor="thinking-enabled">
                {nls.localize('theia/ai/session-settings-dialog/enableThinking', 'Enable extended thinking')}
            </label>
        </div>
        <div className="session-settings-budget-container">
            <label
                htmlFor="thinking-budget"
                className={!enabled ? 'disabled' : ''}
            >
                {nls.localize('theia/ai/session-settings-dialog/budgetTokens', 'Budget tokens:')}
            </label>
            <input
                type="number"
                id="thinking-budget"
                min={1000}
                max={100000}
                step={1000}
                value={budgetTokens}
                placeholder="10000"
                disabled={!enabled}
                onChange={e => onBudgetChange(parseInt(e.target.value, 10))}
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
    thinkingEnabled: boolean;
    thinkingBudget: number;
    errorMessage: string;
    onThinkingEnabledChange: (enabled: boolean) => void;
    onThinkingBudgetChange: (budget: number) => void;
}

const DialogContent: React.FC<DialogContentProps> = ({
    thinkingEnabled,
    thinkingBudget,
    errorMessage,
    onThinkingEnabledChange,
    onThinkingBudgetChange
}) => (
    <div className="session-settings-container">
        <ThinkingModeSection
            enabled={thinkingEnabled}
            budgetTokens={thinkingBudget}
            onEnabledChange={onThinkingEnabledChange}
            onBudgetChange={onThinkingBudgetChange}
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

    protected thinkingEnabled: boolean;
    protected thinkingBudget: number;

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

        // Extract thinking mode settings from commonSettings
        this.thinkingEnabled = this.settings.commonSettings?.thinkingMode?.enabled ?? false;
        this.thinkingBudget = this.settings.commonSettings?.thinkingMode?.budgetTokens ?? 10000;

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
        this.render();
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
                thinkingEnabled={this.thinkingEnabled}
                thinkingBudget={this.thinkingBudget}
                errorMessage={this.errorMessage}
                onThinkingEnabledChange={this.handleThinkingEnabledChange}
                onThinkingBudgetChange={this.handleThinkingBudgetChange}
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
        this.settings = {
            ...advancedSettings,
            commonSettings: this.thinkingEnabled ? {
                thinkingMode: {
                    enabled: true,
                    budgetTokens: isNaN(this.thinkingBudget) ? undefined : this.thinkingBudget
                }
            } : undefined
        };
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

    protected handleThinkingEnabledChange = (enabled: boolean): void => {
        this.thinkingEnabled = enabled;
        this.updateSettingsFromThinkingMode();
        this.render();
        this.attachEditorContainer();
    };

    protected handleThinkingBudgetChange = (budget: number): void => {
        this.thinkingBudget = budget;
        this.updateSettingsFromThinkingMode();
    };

    protected updateSettingsFromThinkingMode(): void {
        this.settings.commonSettings = this.thinkingEnabled ? {
            thinkingMode: {
                enabled: true,
                budgetTokens: isNaN(this.thinkingBudget) ? undefined : this.thinkingBudget
            }
        } : undefined;
    }

    get value(): ChatSessionSettings {
        return this.settings;
    }
}
