// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import {
    AIVariableContext, AIVariableContribution,
    AIVariableOpener, AIVariableResolutionRequest, AIVariableResolver, ResolvedAIContextVariable
} from '@theia/ai-core';
import { FrontendVariableService, AIVariablePasteResult, AIVariableCompletionContext } from '@theia/ai-core/lib/browser';
import * as monaco from '@theia/monaco-editor-core';
import { ILogger, nls, Path, URI } from '@theia/core';
import { LabelProvider, LabelProviderContribution, open, OpenerService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { IMAGE_CONTEXT_VARIABLE, ImageContextVariable, ImageContextVariableRequest, ResolvedImageContextVariable } from '../common/image-context-variable';
import { ChatSessionContext } from '../common/chat-agents';
import { PendingImageRegistry } from './pending-image-registry';

@injectable()
export class ImageContextVariableContribution implements AIVariableContribution, AIVariableResolver, AIVariableOpener, LabelProviderContribution {
    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly wsService: WorkspaceService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(PendingImageRegistry)
    protected readonly pendingImageRegistry: PendingImageRegistry;

    registerVariables(service: FrontendVariableService): void {
        service.registerResolver(IMAGE_CONTEXT_VARIABLE, this);
        service.registerOpener(IMAGE_CONTEXT_VARIABLE, this);
        service.registerPasteHandler(this.handlePaste.bind(this));
        service.registerArgumentCompletionProvider(IMAGE_CONTEXT_VARIABLE, this.provideArgumentCompletionItems.bind(this));
    }

    async canResolve(request: AIVariableResolutionRequest, _: AIVariableContext): Promise<number> {
        return ImageContextVariable.isImageContextRequest(request) ? 1 : 0;
    }

    async resolve(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<ResolvedAIContextVariable | undefined> {
        if (!ImageContextVariable.isImageContextRequest(request)) {
            return undefined;
        }

        const arg = request.arg;

        // Check if this is a short ID (e.g., "img_1") that needs to be looked up in the pending image registry
        if (this.pendingImageRegistry.isShortId(arg)) {
            const resolved = await this.resolveFromRegistry(arg, context);
            if (resolved) {
                return resolved;
            }
            // Short ID not found in registry - this can happen if:
            // - The context doesn't have a ChatSessionContext (e.g., during autocomplete)
            // - The image was already cleared after send
            // Don't fall through to JSON parsing since short IDs aren't valid JSON
            return undefined;
        }

        // Try to parse as JSON (full inline reference or path-based)
        let parsed: ImageContextVariable;
        try {
            parsed = ImageContextVariable.parseArg(arg);
        } catch {
            // Only warn for non-short-ID args that fail to parse
            this.logger.warn(`Failed to parse image context variable arg: ${arg}`);
            return undefined;
        }

        // If already resolved (has data), use as-is
        if (ImageContextVariable.isResolved(parsed)) {
            return this.createResolvedVariable(request, parsed);
        }

        // Path-based reference - need to load the image data
        if (parsed.wsRelativePath) {
            const resolved = await this.resolveFromPath(parsed);
            if (resolved) {
                return this.createResolvedVariable(request, resolved);
            }
        }

        return undefined;
    }

    protected async resolveFromRegistry(shortId: string, context: AIVariableContext): Promise<ResolvedAIContextVariable | undefined> {
        let pendingData: ReturnType<typeof this.pendingImageRegistry.get> | undefined;

        // Try to get the model ID from the context to construct the scope URI
        if (ChatSessionContext.is(context)) {
            const modelId = context.model.id;
            const scopeUri = this.pendingImageRegistry.getScopeUriForModel(modelId);
            pendingData = this.pendingImageRegistry.get(scopeUri, shortId);
        }

        // Fallback to global short ID lookup if scoped lookup failed
        if (!pendingData) {
            pendingData = this.pendingImageRegistry.getByShortId(shortId);
        }

        if (!pendingData) {
            return undefined;
        }

        const imageVariable = pendingData.imageVariable;

        // If already resolved (has data), use directly
        if (ImageContextVariable.isResolved(imageVariable)) {
            const fullRequest: ImageContextVariableRequest = {
                variable: IMAGE_CONTEXT_VARIABLE,
                arg: pendingData.fullArg
            };
            return this.createResolvedVariable(fullRequest, imageVariable);
        }

        // If path-based, resolve from path
        if (imageVariable.wsRelativePath) {
            const resolved = await this.resolveFromPath(imageVariable);
            if (resolved) {
                const fullRequest: ImageContextVariableRequest = {
                    variable: IMAGE_CONTEXT_VARIABLE,
                    arg: pendingData.fullArg
                };
                return this.createResolvedVariable(fullRequest, resolved);
            }
        }

        return undefined;
    }

    protected createResolvedVariable(request: ImageContextVariableRequest, resolved: ResolvedImageContextVariable): ResolvedAIContextVariable {
        // Update the arg with the fully resolved data so it's available for display/serialization
        const resolvedRequest: ImageContextVariableRequest = {
            ...request,
            arg: ImageContextVariable.createArgString(resolved)
        };
        return ImageContextVariable.resolve(resolvedRequest);
    }

    protected async resolveFromPath(variable: ImageContextVariable): Promise<ResolvedImageContextVariable | undefined> {
        if (!variable.wsRelativePath) {
            return undefined;
        }

        try {
            const uri = await this.makeAbsolute(variable.wsRelativePath);
            if (!uri) {
                this.logger.warn(`Could not resolve path for image: ${variable.wsRelativePath}`);
                return undefined;
            }

            const data = await this.fileToBase64(uri);
            if (!data) {
                return undefined;
            }

            const mimeType = this.getMimeTypeFromExtension(variable.wsRelativePath);

            return {
                name: variable.name,
                wsRelativePath: variable.wsRelativePath,
                data,
                mimeType
            };
        } catch (error) {
            this.logger.error(`Failed to resolve image from path: ${variable.wsRelativePath}`, error);
            return undefined;
        }
    }

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

    async canOpen(request: AIVariableResolutionRequest, context: AIVariableContext): Promise<number> {
        return ImageContextVariable.isImageContextRequest(request) && !!ImageContextVariable.parseRequest(request)?.wsRelativePath ? 1 : 0;
    }

    async open(request: ImageContextVariableRequest, context: AIVariableContext): Promise<void> {
        const uri = await this.toUri(request);
        if (!uri) {
            throw new Error('Unable to resolve URI for request.');
        }
        await open(this.openerService, uri);
    }

    protected async toUri(request: ImageContextVariableRequest): Promise<URI | undefined> {
        const variable = ImageContextVariable.parseRequest(request);
        return variable?.wsRelativePath ? this.makeAbsolute(variable.wsRelativePath) : undefined;
    }

    async handlePaste(event: ClipboardEvent, context: AIVariableContext): Promise<AIVariablePasteResult | undefined> {
        if (!event.clipboardData?.items) { return undefined; }

        const variables: AIVariableResolutionRequest[] = [];

        for (const item of event.clipboardData.items) {
            if (item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                if (blob) {
                    try {
                        const dataUrl = await this.readFileAsDataURL(blob);
                        // Extract the base64 data by removing the data URL prefix
                        // Format is like: data:image/png;base64,BASE64DATA
                        const imageData = dataUrl.substring(dataUrl.indexOf(',') + 1);
                        variables.push(ImageContextVariable.createRequest({
                            data: imageData,
                            name: blob.name || `pasted-image-${Date.now()}.png`,
                            mimeType: blob.type
                        }));
                    } catch (error) {
                        console.error('Failed to process pasted image:', error);
                    }
                }
            }
        }

        return variables.length > 0 ? { variables } : undefined;
    }

    private readFileAsDataURL(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
                if (!e.target?.result) {
                    reject(new Error('Failed to read file as data URL'));
                    return;
                }
                resolve(e.target.result as string);
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }

    protected async makeAbsolute(pathStr: string): Promise<URI | undefined> {
        const path = new Path(Path.normalizePathSeparator(pathStr));
        if (!path.isAbsolute) {
            const workspaceRoots = this.wsService.tryGetRoots();
            const wsUris = workspaceRoots.map(root => root.resource.resolve(path));
            for (const uri of wsUris) {
                if (await this.fileService.exists(uri)) {
                    return uri;
                }
            }
        }
        const argUri = new URI(pathStr);
        if (await this.fileService.exists(argUri)) {
            return argUri;
        }
        return undefined;
    }

    canHandle(element: object): number {
        return ImageContextVariable.isImageContextRequest(element) ? 10 : -1;
    }

    protected parseArgSafe(arg: string): ImageContextVariable | undefined {
        try {
            return ImageContextVariable.parseArg(arg);
        } catch {
            return undefined;
        }
    }

    getIcon(element: ImageContextVariableRequest): string | undefined {
        const path = this.parseArgSafe(element.arg)?.wsRelativePath;
        return path ? this.labelProvider.getIcon(new URI(path)) : undefined;
    }

    getName(element: ImageContextVariableRequest): string | undefined {
        return this.parseArgSafe(element.arg)?.name;
    }

    getDetails(element: ImageContextVariableRequest): string | undefined {
        const path = this.parseArgSafe(element.arg)?.wsRelativePath;
        return path ? this.labelProvider.getDetails(new URI(path)) : undefined;
    }

    /**
     * Provides completion items for pending images in the current chat session.
     * This allows users to discover available `img_1`, `img_2`, etc. short IDs
     * when typing `#imageContext:`.
     */
    protected async provideArgumentCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        matchString?: string
    ): Promise<monaco.languages.CompletionItem[] | undefined> {
        const context = AIVariableCompletionContext.get(IMAGE_CONTEXT_VARIABLE.name, model, position, matchString);
        if (!context) {
            return undefined;
        }
        const { userInput, range, prefix } = context;

        // Get the model ID from the editor URI to find the correct scope
        const editorUri = model.uri.toString();
        const modelId = this.pendingImageRegistry.getModelIdForEditor(editorUri);
        if (!modelId) {
            return undefined;
        }

        const scopeUri = this.pendingImageRegistry.getScopeUriForModel(modelId);
        const pendingImages = this.pendingImageRegistry.getAllForScope(scopeUri);

        if (pendingImages.size === 0) {
            return undefined;
        }

        const completionItems: monaco.languages.CompletionItem[] = [];
        let index = 0;

        for (const [shortId, data] of pendingImages) {
            // Filter by user input if they've started typing
            if (userInput && !shortId.toLowerCase().startsWith(userInput.toLowerCase())) {
                continue;
            }

            const imageName = data.imageVariable.name ?? data.imageVariable.wsRelativePath ?? shortId;
            const detail = data.imageVariable.wsRelativePath
                ? nls.localize('theia/ai/chat/pendingImage/file', 'Pending image: {0}', data.imageVariable.wsRelativePath)
                : nls.localize('theia/ai/chat/pendingImage/pasted', 'Pending image (pasted)');

            completionItems.push({
                label: shortId,
                kind: monaco.languages.CompletionItemKind.File,
                range,
                insertText: `${prefix}${shortId}`,
                detail,
                documentation: imageName,
                filterText: userInput || shortId,
                sortText: `AA${index.toString().padStart(4, '0')}_${shortId}`,
            });
            index++;
        }

        return completionItems;
    }
}
