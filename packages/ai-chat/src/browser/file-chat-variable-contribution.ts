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

import { AIVariableContribution, AIVariableService, PromptText } from '@theia/ai-core';
import { FILE_VARIABLE } from '@theia/ai-core/lib/browser/file-variable-contribution';
import { CancellationToken, QuickInputService } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';
import { FileQuickPickItem, QuickFileSelectService } from '@theia/file-search/lib/browser/quick-file-select-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';

@injectable()
export class FileChatVariableContribution implements AIVariableContribution {
    @inject(WorkspaceService)
    protected readonly wsService: WorkspaceService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(QuickFileSelectService)
    protected readonly quickFileSelectService: QuickFileSelectService;

    registerVariables(service: AIVariableService): void {
        service.registerArgumentPicker(FILE_VARIABLE, this.triggerArgumentPicker.bind(this));
        service.registerArgumentCompletionProvider(FILE_VARIABLE, this.provideArgumentCompletionItems.bind(this));
    }

    private async triggerArgumentPicker(): Promise<string | undefined> {
        const quickPick = this.quickInputService.createQuickPick();
        quickPick.items = await this.quickFileSelectService.getPicks();

        const updateItems = async (value: string) => {
            quickPick.items = await this.quickFileSelectService.getPicks(value, CancellationToken.None);
        };

        const onChangeListener = quickPick.onDidChangeValue(updateItems);
        quickPick.show();

        return new Promise(resolve => {
            quickPick.onDispose(onChangeListener.dispose);
            quickPick.onDidAccept(async () => {
                const selectedItem = quickPick.selectedItems[0];
                if (selectedItem && FileQuickPickItem.is(selectedItem)) {
                    quickPick.dispose();
                    resolve(await this.wsService.getWorkspaceRelativePath(selectedItem.uri));
                }
            });
        });
    }

    private async provideArgumentCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position
    ): Promise<monaco.languages.CompletionItem[] | undefined> {
        const lineContent = model.getLineContent(position.lineNumber);
        const triggerCharIndex = lineContent.lastIndexOf(PromptText.VARIABLE_CHAR, position.column - 1);
        if (triggerCharIndex === -1) {
            return undefined;
        }

        const typedWord = lineContent.substring(triggerCharIndex + 1, position.column - 1);
        if (typedWord.includes(' ')) {
            return undefined;
        }

        const range = new monaco.Range(position.lineNumber, triggerCharIndex + 2, position.lineNumber, position.column);
        const picks = await this.quickFileSelectService.getPicks(typedWord, CancellationToken.None);

        return Promise.all(
            picks
                .filter(FileQuickPickItem.is)
                // only show files with highlights, if the user started typing to filter down the results
                .filter(p => !typedWord || p.highlights?.label)
                .map(async (pick, index) => ({
                    label: pick.label,
                    kind: monaco.languages.CompletionItemKind.File,
                    range,
                    // don't let monaco filter the items, as we only return picks that are filtered
                    filterText: typedWord,
                    insertText: await this.wsService.getWorkspaceRelativePath(pick.uri),
                    detail: await this.wsService.getWorkspaceRelativePath(pick.uri.parent),
                    // keep the order of the items, but move them to the end of the list
                    sortText: `ZZ${index.toString().padStart(4, '0')}_${pick.label}`,
                }))
        );
    }
}
