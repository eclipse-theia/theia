// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandService } from '@theia/core/lib/common/command';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';
import { MonacoEditorService } from '@theia/monaco/lib/browser/monaco-editor-service';
import { AIActivationService } from '@theia/ai-core/lib/browser/ai-activation-service';

export const AI_EDITOR_SEND_TO_CHAT = {
    id: 'ai-editor.sendToChat',
};

@injectable()
export class AICodeActionProvider implements FrontendApplicationContribution {

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(MonacoEditorService)
    protected readonly monacoEditorService: MonacoEditorService;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    protected readonly toDispose = new DisposableCollection();

    onStart(): void {
        this.registerCodeActionProvider();

        // Listen to AI activation changes and re-register the provider
        this.activationService.onDidChangeActiveStatus(() => {
            this.toDispose.dispose();
            this.registerCodeActionProvider();
        });
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected registerCodeActionProvider(): void {
        if (!this.activationService.isActive) {
            // AI is disabled, don't register the provider
            return;
        }

        const disposable = monaco.languages.registerCodeActionProvider('*', {
            provideCodeActions: (model, range, context, token) => {
                // Double-check activation status in the provider
                if (!this.activationService.isActive) {
                    return { actions: [], dispose: () => { } };
                }

                // Filter for error markers only
                const errorMarkers = context.markers.filter(marker =>
                    marker.severity === monaco.MarkerSeverity.Error);

                if (errorMarkers.length === 0) {
                    return { actions: [], dispose: () => { } };
                }

                const actions: monaco.languages.CodeAction[] = [];

                // Create code actions for each error marker: Fix with AI and Explain with AI
                errorMarkers.forEach(marker => {
                    actions.push({
                        title: 'Fix with AI',
                        diagnostics: [marker],
                        isAI: true,
                        kind: 'quickfix',
                        command: {
                            id: AI_EDITOR_SEND_TO_CHAT.id,
                            title: 'Fix with AI',
                            arguments: [{
                                prompt: `@Coder Help to fix this error: "${marker.message}"`
                            }]
                        }
                    });
                    actions.push({
                        title: 'Explain with AI',
                        diagnostics: [marker],
                        kind: 'quickfix',
                        isAI: true,
                        command: {
                            id: AI_EDITOR_SEND_TO_CHAT.id,
                            title: 'Explain with AI',
                            arguments: [{
                                prompt: `@Architect Explain this error: "${marker.message}"`
                            }]
                        }
                    });
                });
                return {
                    actions: actions,
                    dispose: () => { }
                };
            }
        });

        this.toDispose.push(disposable);
    }
}
