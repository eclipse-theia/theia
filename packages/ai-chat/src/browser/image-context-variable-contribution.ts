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
import { FrontendVariableService, AIVariablePasteResult } from '@theia/ai-core/lib/browser';
import { Path, URI } from '@theia/core';
import { LabelProvider, LabelProviderContribution, open, OpenerService } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { IMAGE_CONTEXT_VARIABLE, ImageContextVariable, ImageContextVariableRequest } from '../common/image-context-variable';

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

    registerVariables(service: FrontendVariableService): void {
        service.registerResolver(IMAGE_CONTEXT_VARIABLE, this);
        service.registerOpener(IMAGE_CONTEXT_VARIABLE, this);
        service.registerPasteHandler(this.handlePaste.bind(this));
    }

    async canResolve(request: AIVariableResolutionRequest, _: AIVariableContext): Promise<number> {
        return ImageContextVariable.isImageContextRequest(request) ? 1 : 0;
    }

    async resolve(request: AIVariableResolutionRequest, _: AIVariableContext): Promise<ResolvedAIContextVariable | undefined> {
        return ImageContextVariable.resolve(request as ImageContextVariableRequest);
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
                            mimeType: blob.type,
                            origin: 'temporary'
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
}
