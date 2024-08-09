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

import * as monaco from '@theia/monaco-editor-core';
import { FrontendApplicationContribution, PreferenceService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AICodeFixProvider } from './ai-code-fix-provider';
import { AICodeFixPrefs } from './ai-code-fix-preference';
import { AIActivationService } from '@theia/ai-core/lib/browser';

const AI_CODE_FIX_COMMAND_ID = 'ai-code-fix';

@injectable()
export class AIFrontendApplicationContribution implements FrontendApplicationContribution {
    @inject(AICodeFixProvider)
    private codeFixProvider: AICodeFixProvider;

    @inject(PreferenceService)
    private readonly preferenceService: PreferenceService;

    @inject(AIActivationService)
    protected aiActivationService: AIActivationService;

    private disposable: monaco.IDisposable | undefined;

    protected get isCodeFixingEnabled(): boolean {
        return this.preferenceService.get<boolean>(AICodeFixPrefs.ENABLED, false);
    }

    onDidInitializeLayout(): void {
        if (this.isCodeFixingEnabled && this.aiActivationService.isActive) {
            const disposeCommand = monaco.editor.registerCommand(AI_CODE_FIX_COMMAND_ID, (_accessor, ...args) => {
                const arg = args[0];
                const newText: string = arg.newText;
                const editor: monaco.editor.ICodeEditor = arg.editor;
                const range = arg.range;
                const command = {
                    identifier: AI_CODE_FIX_COMMAND_ID,
                    range,
                    text: newText,
                    forceMoveMarkers: true
                };
                editor.executeEdits(AI_CODE_FIX_COMMAND_ID, [command]);
            });
            const disposeCodeActionProvider = monaco.languages.registerCodeActionProvider({ scheme: 'file' }, (this.codeFixProvider as monaco.languages.CodeActionProvider));
            this.disposable = {
                dispose(): void {
                    disposeCommand.dispose();
                    disposeCodeActionProvider.dispose();
                }
            };
        }
        this.aiActivationService.onDidChangeActiveStatus(status => {
            this.handlePreferenceChange(this.isCodeFixingEnabled, status);
        });
        this.preferenceService.onPreferenceChanged(event => {
            if (event.preferenceName === AICodeFixPrefs.ENABLED) {
                this.handlePreferenceChange(event.newValue, this.aiActivationService.isActive);
            }
        });
    }

    protected handlePreferenceChange(isCodeFixingEnabled: boolean, isActive: boolean): void {
        if (this.disposable) {
            this.disposable.dispose();
            this.disposable = undefined;
        }
        if (isActive && isCodeFixingEnabled) {
            this.disposable = monaco.languages.registerCodeActionProvider({ scheme: 'file' }, (this.codeFixProvider as monaco.languages.CodeActionProvider));
        }
    }

    onStop(): void {
    }
}
