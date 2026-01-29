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

import { AIVariableContext, AIVariableResolutionRequest, PromptText } from '@theia/ai-core';
import { AIVariableCompletionContext, AIVariableDropResult, FrontendVariableContribution, FrontendVariableService } from '@theia/ai-core/lib/browser';
import { FILE_VARIABLE } from '@theia/ai-core/lib/browser/file-variable-contribution';
import { CancellationToken, ILogger, nls, QuickInputService, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';
import { FileQuickPickItem, QuickFileSelectService } from '@theia/file-search/lib/browser/quick-file-select-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { VARIABLE_ADD_CONTEXT_COMMAND } from './ai-chat-frontend-contribution';
import { IMAGE_CONTEXT_VARIABLE, ImageContextVariable } from '../common/image-context-variable';
import { ApplicationShell } from '@theia/core/lib/browser';

@injectable()
export class FileChatVariableContribution implements FrontendVariableContribution {
    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly wsService: WorkspaceService;

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(QuickFileSelectService)
    protected readonly quickFileSelectService: QuickFileSelectService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    registerVariables(service: FrontendVariableService): void {
        service.registerArgumentPicker(FILE_VARIABLE, this.triggerArgumentPicker.bind(this));
        service.registerArgumentPicker(IMAGE_CONTEXT_VARIABLE, this.imageArgumentPicker.bind(this));
        service.registerArgumentCompletionProvider(FILE_VARIABLE, this.provideArgumentCompletionItems.bind(this));
        service.registerDropHandler(this.handleDrop.bind(this));
    }

    protected async triggerArgumentPicker(): Promise<string | undefined> {
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

    protected async imageArgumentPicker(): Promise<string | undefined> {
        const quickPick = this.quickInputService.createQuickPick();
        quickPick.title = nls.localize('theia/ai/chat/selectImageFile', 'Select an image file');

        // Get all files and filter only image files
        const allPicks = await this.quickFileSelectService.getPicks();
        quickPick.items = allPicks.filter(item => {
            if (FileQuickPickItem.is(item)) {
                return this.isImageFile(item.uri.path.toString());
            }
            return false;
        });

        const updateItems = async (value: string) => {
            const filteredPicks = await this.quickFileSelectService.getPicks(value, CancellationToken.None);
            quickPick.items = filteredPicks.filter(item => {
                if (FileQuickPickItem.is(item)) {
                    return this.isImageFile(item.uri.path.toString());
                }
                return false;
            });
        };

        const onChangeListener = quickPick.onDidChangeValue(updateItems);
        quickPick.show();

        return new Promise(resolve => {
            quickPick.onDispose(onChangeListener.dispose);
            quickPick.onDidAccept(async () => {
                const selectedItem = quickPick.selectedItems[0];
                if (selectedItem && FileQuickPickItem.is(selectedItem)) {
                    quickPick.dispose();
                    const filePath = await this.wsService.getWorkspaceRelativePath(selectedItem.uri);
                    const fileName = selectedItem.uri.displayName;
                    const base64Data = await this.fileToBase64(selectedItem.uri);
                    if (!base64Data) {
                        resolve(undefined);
                        return;
                    }
                    const mimeType = this.getMimeTypeFromExtension(selectedItem.uri.path.toString());

                    // Create the argument string in the required format
                    const imageVarArgs: ImageContextVariable = {
                        name: fileName,
                        wsRelativePath: filePath,
                        data: base64Data,
                        mimeType: mimeType,
                        origin: 'context'
                    };

                    resolve(ImageContextVariable.createArgString(imageVarArgs));
                }
            });
        });
    }

    protected async provideArgumentCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        matchString?: string
    ): Promise<monaco.languages.CompletionItem[] | undefined> {
        const context = AIVariableCompletionContext.get(FILE_VARIABLE.name, model, position, matchString);
        if (!context) { return undefined; }
        const { userInput, range, prefix } = context;

        const picks = await this.quickFileSelectService.getPicks(userInput, CancellationToken.None);

        return Promise.all(
            picks
                .filter(FileQuickPickItem.is)
                // only show files with highlights, if the user started typing to filter down the results
                .filter(p => !userInput || p.highlights?.label)
                .map(async (pick, index) => {
                    const relativePath = await this.wsService.getWorkspaceRelativePath(pick.uri);
                    return {
                        label: pick.label,
                        kind: monaco.languages.CompletionItemKind.File,
                        range,
                        insertText: `${prefix}${relativePath}`,
                        detail: await this.wsService.getWorkspaceRelativePath(pick.uri.parent),
                        // don't let monaco filter the items, as we only return picks that are filtered
                        filterText: userInput,
                        // keep the order of the items, but move them to the end of the list
                        sortText: `ZZ${index.toString().padStart(4, '0')}_${pick.label}`,
                        command: {
                            title: VARIABLE_ADD_CONTEXT_COMMAND.label!,
                            id: VARIABLE_ADD_CONTEXT_COMMAND.id,
                            arguments: [FILE_VARIABLE.name, relativePath]
                        }
                    };
                })
        );
    }

    /**
     * Checks if a file is an image based on its extension.
     */
    protected isImageFile(filePath: string): boolean {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp'];
        const extension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
        return imageExtensions.includes(extension);
    }

    /**
     * Determines the MIME type based on file extension.
     */
    protected getMimeTypeFromExtension(filePath: string): string {
        const extension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
        const mimeTypes: { [key: string]: string } = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.bmp': 'image/bmp',
            '.svg': 'image/svg+xml',
            '.webp': 'image/webp'
        };
        return mimeTypes[extension] || 'application/octet-stream';
    }

    /**
     * Converts a file to base64 data URL.
     */
    protected async fileToBase64(uri: URI): Promise<string> {
        try {
            const fileContent = await this.fileService.readFile(uri);
            const uint8Array = new Uint8Array(fileContent.value.buffer);
            let binary = '';
            for (let i = 0; i < uint8Array.length; i++) {
                binary += String.fromCharCode(uint8Array[i]);
            }
            return btoa(binary);
        } catch (error) {
            this.logger.error('Error reading file content:', error);
            return '';
        }
    }

    protected async handleDrop(event: DragEvent, _: AIVariableContext): Promise<AIVariableDropResult | undefined> {
        if (!event.dataTransfer) {
            return undefined;
        }

        const uris = ApplicationShell.getDraggedEditorUris(event.dataTransfer);
        if (!uris.length) {
            return undefined;
        }

        try {
            const variables: AIVariableResolutionRequest[] = [];
            const texts: string[] = [];
            for (const uri of uris) {
                if (await this.fileService.exists(uri)) {
                    const wsRelativePath = await this.wsService.getWorkspaceRelativePath(uri);
                    const fileName = uri.displayName;

                    if (!wsRelativePath) {
                        continue;
                    }

                    if (this.isImageFile(wsRelativePath)) {
                        const base64Data = await this.fileToBase64(uri);
                        if (!base64Data) {
                            continue;
                        }
                        const mimeType = this.getMimeTypeFromExtension(wsRelativePath);
                        variables.push(ImageContextVariable.createRequest({
                            name: fileName,
                            wsRelativePath,
                            data: base64Data,
                            mimeType,
                            origin: 'temporary'
                        }));
                        // we do not want to push a text for image variables
                    } else {
                        variables.push({
                            variable: FILE_VARIABLE,
                            arg: wsRelativePath
                        });
                        texts.push(`${PromptText.VARIABLE_CHAR}${FILE_VARIABLE.name}${PromptText.VARIABLE_SEPARATOR_CHAR}${wsRelativePath}`);
                    }
                }
            }

            return { variables, text: texts.length ? texts.join(' ') : undefined };
        } catch {
            return undefined;
        }
    }
}
