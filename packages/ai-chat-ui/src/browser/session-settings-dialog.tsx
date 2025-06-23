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

import { InMemoryResources, URI, nls } from '@theia/core';
import { AbstractDialog } from '@theia/core/lib/browser/dialogs';

import { Message } from '@theia/core/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';

export interface SessionSettingsDialogProps {
    initialSettings: { [key: string]: unknown } | undefined;
}

export class SessionSettingsDialog extends AbstractDialog<{ [key: string]: unknown }> {

    protected jsonEditor: MonacoEditor | undefined;
    protected dialogContent: HTMLDivElement;
    protected errorMessageDiv: HTMLDivElement;
    protected settings: { [key: string]: unknown } = {};
    protected initialSettingsString: string;

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
        this.initialSettingsString = JSON.stringify(initialSettings, undefined, 2) || '{}';

        this.contentNode.classList.add('monaco-session-settings-dialog');

        this.dialogContent = document.createElement('div');
        this.dialogContent.className = 'session-settings-container';
        this.contentNode.appendChild(this.dialogContent);

        this.errorMessageDiv = document.createElement('div');
        this.errorMessageDiv.className = 'session-settings-error';
        this.contentNode.appendChild(this.errorMessageDiv);

        this.appendCloseButton(nls.localizeByDefault('Cancel'));
        this.appendAcceptButton(nls.localizeByDefault('Apply'));

        this.createJsonEditor();

        this.validateJson();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        if (this.jsonEditor) {
            this.jsonEditor.focus();
        }
    }
    protected async createJsonEditor(): Promise<void> {

        this.resources.update(this.uri, this.initialSettingsString);
        try {
            const editor = await this.editorProvider.createInline(this.uri, this.dialogContent, {
                language: 'json',
                automaticLayout: true,
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
            editor.document.textEditorModel.setValue(this.initialSettingsString);

            this.jsonEditor = editor;
            this.validateJson();
        } catch (error) {
            console.error('Failed to create JSON editor:', error);
        }
    }

    protected validateJson(): void {
        if (!this.jsonEditor) {
            return;
        }

        const jsonContent = this.jsonEditor.getControl().getValue();

        try {
            this.settings = JSON.parse(jsonContent);
            this.errorMessageDiv.textContent = '';
            this.setErrorButtonState(false);
        } catch (error) {
            this.errorMessageDiv.textContent = `${error}`;
            this.setErrorButtonState(true);
        }
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

    get value(): { [key: string]: unknown } {
        return this.settings;
    }
}
