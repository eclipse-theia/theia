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
            description: nls.localize('theia/ai/chat/imageContextVariable/args/data/description', 'The image data in base64.')
        },
        {
            name: 'mimeType',
            description: nls.localize('theia/ai/chat/imageContextVariable/args/mimeType/description', 'The mimetype of the image.')
        }
    ]
};

export type ImageContextVariableOrigin = 'temporary' | 'context';

export interface ImageContextVariable {
    name?: string;
    wsRelativePath?: string;
    data: string;
    mimeType: string;
    /**
     * Internal metadata. If missing it is treated as 'context'.
     */
    origin?: ImageContextVariableOrigin;
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
    export const origin = 'origin';

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

    export function parseResolved(resolved: ResolvedAIContextVariable): undefined | ImageContextVariable {
        return isResolvedImageContext(resolved) ? parseArg(resolved.arg) : undefined;
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

        if (!result.data) {
            throw new Error(`Missing required argument: ${data}`);
        }

        if (!result.mimeType) {
            throw new Error(`Missing required argument: ${mimeType}`);
        }

        return result as ImageContextVariable;
    }

    export function getOrigin(argString: string): ImageContextVariableOrigin {
        try {
            const parsed = JSON.parse(argString) as { origin?: unknown };
            return parsed.origin === 'temporary' ? 'temporary' : 'context';
        } catch {
            return 'context';
        }
    }

    export function getOriginSafe(request: AIVariableResolutionRequest): ImageContextVariableOrigin | undefined {
        if (!isImageContextRequest(request)) {
            return undefined;
        }
        try {
            return getOrigin(request.arg);
        } catch {
            return undefined;
        }
    }
}
