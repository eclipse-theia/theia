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
    AIVariable,
    AIVariableResolutionRequest,
    ResolvedAIContextVariable
} from '@theia/ai-core';
import { nls } from '@theia/core';
import { ParsedChatRequestPart, ParsedChatRequestVariablePart } from './parsed-chat-request';

export const IMAGE_CONTEXT_VARIABLE: AIVariable = {
    id: 'imageContext',
    description: nls.localize('theia/ai/chat/imageContextVariable/description', 'Provides context information for an image'),
    name: 'imageContext',
    label: nls.localize('theia/ai/chat/imageContextVariable/label', 'Image File'),
    iconClasses: ['codicon', 'codicon-file-media'],
    isContextVariable: true,
    args: [
        {
            name: 'name',
            description: nls.localize('theia/ai/chat/imageContextVariable/args/name/description', 'The name of the image file if available.'),
            isOptional: true
        },
        {
            name: 'wsRelativePath',
            description: nls.localize('theia/ai/chat/imageContextVariable/args/wsRelativePath/description', 'The workspace-relative path of the image file if available.'),
            isOptional: true
        },
        {
            name: 'data',
            description: nls.localize('theia/ai/chat/imageContextVariable/args/data/description', 'The image data in base64.'),
            isOptional: true
        },
        {
            name: 'mimeType',
            description: nls.localize('theia/ai/chat/imageContextVariable/args/mimeType/description', 'The mimetype of the image.'),
            isOptional: true
        }
    ]
};

/**
 * Represents an image context variable. Can be either:
 * - Pre-processed: Contains base64 data (from clipboard paste)
 * - Path-based: Contains only wsRelativePath, data is resolved on-demand (from file drop)
 */
export interface ImageContextVariable {
    name?: string;
    wsRelativePath?: string;
    /** Base64-encoded image data. Optional for path-based references that are resolved on-demand. */
    data?: string;
    /** MIME type of the image. Optional for path-based references that are resolved on-demand. */
    mimeType?: string;
}

/**
 * A fully resolved image context variable with all data present.
 */
export interface ResolvedImageContextVariable extends ImageContextVariable {
    data: string;
    mimeType: string;
}

export interface ImageContextVariableRequest extends AIVariableResolutionRequest {
    variable: typeof IMAGE_CONTEXT_VARIABLE;
    arg: string;
}

export namespace ImageContextVariable {
    export const name = 'name';
    export const wsRelativePath = 'wsRelativePath';
    export const data = 'data';
    export const mimeType = 'mimeType';

    export function isImageContextRequest(request: object): request is ImageContextVariableRequest {
        return AIVariableResolutionRequest.is(request) && request.variable.id === IMAGE_CONTEXT_VARIABLE.id && !!request.arg;
    }

    export function isResolvedImageContext(resolved: object): resolved is ResolvedAIContextVariable & { arg: string } {
        return ResolvedAIContextVariable.is(resolved) && resolved.variable.id === IMAGE_CONTEXT_VARIABLE.id && !!resolved.arg;
    }

    export function parseRequest(request: AIVariableResolutionRequest): undefined | ImageContextVariable {
        return isImageContextRequest(request) ? parseArg(request.arg) : undefined;
    }

    export function resolve(request: ImageContextVariableRequest): ResolvedAIContextVariable {
        const args = parseArg(request.arg);
        return {
            ...request,
            value: args.wsRelativePath ?? args.name ?? 'Image',
            contextValue: args.wsRelativePath ?? args.name ?? 'Image'
        };
    }

    export function parseResolved(resolved: ResolvedAIContextVariable): undefined | ResolvedImageContextVariable {
        if (!isResolvedImageContext(resolved)) {
            return undefined;
        }
        const parsed = parseArg(resolved.arg);
        // Resolved context should always have data and mimeType
        if (isResolved(parsed)) {
            return parsed;
        }
        return undefined;
    }

    export function createRequest(content: ImageContextVariable): ImageContextVariableRequest {
        return {
            variable: IMAGE_CONTEXT_VARIABLE,
            arg: createArgString(content)
        };
    }

    export function createArgString(args: ImageContextVariable): string {
        return JSON.stringify(args);
    }

    /**
     * Parse an argument string into an ImageContextVariable.
     * The variable may be path-based (no data) or pre-processed (with data).
     */
    export function parseArg(argString: string): ImageContextVariable {
        const result: Partial<ImageContextVariable> = {};

        if (!argString) {
            throw new Error('Invalid argument string: empty string');
        }

        try {
            const parsed = JSON.parse(argString) as Partial<ImageContextVariable>;
            Object.assign(result, parsed);
        } catch (error) {
            throw new Error(`Failed to parse JSON argument string: ${error.message}`);
        }

        // For path-based references, we only need wsRelativePath
        // For pre-processed references, we need data and mimeType
        if (!result.data && !result.wsRelativePath) {
            throw new Error('Image variable must have either data or wsRelativePath');
        }

        return result as ImageContextVariable;
    }

    /**
     * Check if an ImageContextVariable has been fully resolved (has data and mimeType).
     */
    export function isResolved(variable: ImageContextVariable): variable is ResolvedImageContextVariable {
        return !!variable.data && !!variable.mimeType;
    }

    /**
     * Create a path-based image request that will be resolved on-demand.
     */
    export function createPathBasedRequest(path: string, imageName?: string): ImageContextVariableRequest {
        return {
            variable: IMAGE_CONTEXT_VARIABLE,
            arg: createArgString({ wsRelativePath: path, name: imageName })
        };
    }

    /**
     * Extract all resolved inline image variables from a list of parsed chat request parts.
     * Parts that fail to parse are silently skipped.
     */
    export function extractInlineImages(parts: ParsedChatRequestPart[]): ResolvedImageContextVariable[] {
        const result: ResolvedImageContextVariable[] = [];
        for (const part of parts) {
            if (part instanceof ParsedChatRequestVariablePart
                && part.variableName === 'imageContext'
                && part.resolution?.arg) {
                try {
                    const parsed = parseArg(part.resolution.arg);
                    if (isResolved(parsed)) {
                        result.push(parsed);
                    }
                } catch {
                    // arg might not be valid JSON, skip
                }
            }
        }
        return result;
    }

    /**
     * Extract resolved inline image variables from a list of parsed chat request parts,
     * keyed by the index of the part in the original array.
     * Parts that fail to parse are silently skipped.
     */
    export function extractInlineImagesWithIndices(parts: ParsedChatRequestPart[]): Map<number, ResolvedImageContextVariable> {
        const result = new Map<number, ResolvedImageContextVariable>();
        parts.forEach((part, index) => {
            if (part instanceof ParsedChatRequestVariablePart
                && part.variableName === 'imageContext'
                && part.resolution?.arg) {
                try {
                    const parsed = parseArg(part.resolution.arg);
                    if (isResolved(parsed)) {
                        result.set(index, parsed);
                    }
                } catch {
                    // arg might not be valid JSON, skip
                }
            }
        });
        return result;
    }
}
