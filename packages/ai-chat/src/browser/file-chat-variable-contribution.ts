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
import { fileToBase64, getMimeTypeFromExtension } from './image-file-utils';
import { ApplicationShell, LabelProvider, NavigatableWidget } from '@theia/core/lib/browser';

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

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

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
        quickPick.placeholder = nls.localize('theia/ai/chat/imagePickerPlaceholder', 'Select an image file or search by name');

        // Create "From Clipboard" option
        const clipboardOption = {
            label: nls.localize('theia/ai/chat/fromClipboard', '$(clippy) From Clipboard'),
            description: nls.localize('theia/ai/chat/fromClipboardDescription', 'Paste image from clipboard'),
            alwaysShow: true,
            isClipboardOption: true
        };

        // Get currently opened image files
        const openedImagePicks = this.getOpenedImageFilePicks();
        const openedUris = new Set(openedImagePicks.map(item => item.uri.toString()));

        // Initial items: opened image files + clipboard option at the end
        quickPick.items = [...openedImagePicks, clipboardOption];

        const updateItems = async (value: string) => {
            if (!value) {
                // No search term: show opened files + clipboard
                quickPick.items = [...openedImagePicks, clipboardOption];
                return;
            }
            // Search for image files
            const picks = await this.quickFileSelectService.getPicks(value, CancellationToken.None);
            const imagePicks = picks.filter((item): item is FileQuickPickItem =>
                FileQuickPickItem.is(item) && this.isImageFile(item.uri.path.toString()) && !openedUris.has(item.uri.toString())
            );
            // Filter opened images by search term
            const lowerValue = value.toLowerCase();
            const filteredOpenedImages = openedImagePicks.filter(item =>
                item.label.toLowerCase().includes(lowerValue) ||
                (item.description?.toLowerCase().includes(lowerValue) ?? false)
            );
            quickPick.items = [...filteredOpenedImages, ...imagePicks, clipboardOption];
        };

        const onChangeListener = quickPick.onDidChangeValue(updateItems);
        quickPick.show();

        return new Promise(resolve => {
            quickPick.onDispose(onChangeListener.dispose);
            quickPick.onDidAccept(async () => {
                const selectedItem = quickPick.selectedItems[0];

                // Handle clipboard option
                if (selectedItem && 'isClipboardOption' in selectedItem) {
                    quickPick.dispose();
                    const clipboardResult = await this.readImageFromClipboard();
                    resolve(clipboardResult);
                    return;
                }

                if (selectedItem && FileQuickPickItem.is(selectedItem)) {
                    quickPick.dispose();
                    const filePath = await this.wsService.getWorkspaceRelativePath(selectedItem.uri);
                    const fileName = selectedItem.uri.displayName;
                    const base64Data = await fileToBase64(selectedItem.uri, this.fileService, this.logger);
                    const mimeType = getMimeTypeFromExtension(selectedItem.uri.path.toString());

                    // Create the argument string in the required format
                    const imageVarArgs: ImageContextVariable = {
                        name: fileName,
                        wsRelativePath: filePath,
                        data: base64Data,
                        mimeType: mimeType
                    };

                    resolve(ImageContextVariable.createArgString(imageVarArgs));
                }
            });
        });
    }

    /**
     * Get URIs of currently opened image files in all widgets.
     */
    protected getOpenedImageUris(): URI[] {
        const seenUris = new Set<string>();
        const mainWidgets = this.shell.getWidgets('main');

        return [...NavigatableWidget.get(mainWidgets, uri => this.isImageFile(uri.path.toString()))]
            .map(([uri]) => uri)
            .filter(uri => {
                const uriString = uri.toString();
                if (seenUris.has(uriString)) {
                    return false;
                }
                seenUris.add(uriString);
                return true;
            });
    }

    /**
     * Get quick pick items for opened image files.
     * Creates items directly with proper file icons from the labelProvider.
     */
    protected getOpenedImageFilePicks(): FileQuickPickItem[] {
        const openedImageUris = this.getOpenedImageUris();
        if (openedImageUris.length === 0) {
            return [];
        }

        const openedImagePicks: FileQuickPickItem[] = [];

        for (const uri of openedImageUris) {
            const label = this.labelProvider.getName(uri);
            const description = this.labelProvider.getDetails(uri);
            const iconClasses = this.getFileIconClasses(uri);

            openedImagePicks.push({
                label,
                description,
                iconClasses,
                uri,
                alwaysShow: true
            });
        }

        return openedImagePicks;
    }

    /**
     * Read an image from the clipboard and return it as an ImageContextVariable argument string.
     */
    protected async readImageFromClipboard(): Promise<string | undefined> {
        try {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                const imageType = item.types.find(type => type.startsWith('image/'));
                if (imageType) {
                    const blob = await item.getType(imageType);
                    const base64Data = await this.blobToBase64(blob);
                    const imageVarArgs: ImageContextVariable = {
                        name: `clipboard-image-${Date.now()}.${imageType.split('/')[1]}`,
                        data: base64Data,
                        mimeType: imageType
                    };
                    return ImageContextVariable.createArgString(imageVarArgs);
                }
            }
            this.logger.warn('No image found in clipboard');
            return undefined;
        } catch (error) {
            this.logger.error('Failed to read image from clipboard:', error);
            return undefined;
        }
    }

    /**
     * Convert a Blob to base64 string.
     */
    protected blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                // Extract base64 data by removing the data URL prefix
                const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);
                resolve(base64Data);
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
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
     * Get icon classes for a file URI, matching the format used by QuickFileSelectService.
     */
    protected getFileIconClasses(uri: URI): string[] {
        const icon = this.labelProvider.getIcon(uri).split(' ').filter(v => v.length > 0);
        if (icon.length > 0) {
            icon.push('file-icon');
        }
        return icon;
    }

    /**
     * Checks if a file is an image based on its extension.
     */
    protected isImageFile(filePath: string): boolean {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp'];
        const extension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
        return imageExtensions.includes(extension);
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

                    if (wsRelativePath && this.isImageFile(wsRelativePath)) {
                        // Create a path-based reference - the image will be resolved on-demand
                        // This avoids eagerly loading base64 data for file-based images
                        variables.push(ImageContextVariable.createPathBasedRequest(wsRelativePath, fileName));
                        // we do not want to push a text for image variables
                    } else if (wsRelativePath) {
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
