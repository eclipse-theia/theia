// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { Event, nls } from '@theia/core';

export type SketchedToolParameterType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';

export type SketchedToolReturnMode = 'static' | 'askAtRuntime';

export interface SketchedToolParameterDefinition {
    name: string;
    description: string;
    type: SketchedToolParameterType;
    required?: boolean;
    /** For type 'object': nested properties (max 2 levels) */
    properties?: SketchedToolParameterDefinition[];
    /** For type 'array': item type */
    itemType?: 'string' | 'number' | 'integer' | 'boolean' | 'object';
    /** For type 'array' with itemType 'object': properties of the item object */
    itemProperties?: SketchedToolParameterDefinition[];
}

export interface SketchedToolDefinition {
    id: string;
    name: string;
    description: string;
    parameters: SketchedToolParameterDefinition[];
    returnMode: SketchedToolReturnMode;
    staticReturn: string;
}

export namespace SketchedToolDefinition {
    export function is(obj: unknown): obj is SketchedToolDefinition {
        // eslint-disable-next-line no-null/no-null
        if (typeof obj !== 'object' || obj === null) {
            return false;
        }
        const candidate = obj as Record<string, unknown>;
        if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') {
            return false;
        }
        if (typeof candidate.description !== 'string') {
            return false;
        }
        if (!Array.isArray(candidate.parameters)) {
            return false;
        }
        if (candidate.returnMode !== undefined && candidate.returnMode !== 'static' && candidate.returnMode !== 'askAtRuntime') {
            return false;
        }
        // returnMode and staticReturn are optional here; normalize() fills in defaults.
        if (candidate.staticReturn !== undefined && typeof candidate.staticReturn !== 'string') {
            return false;
        }
        return true;
    }

    export function normalize(obj: SketchedToolDefinition): SketchedToolDefinition {
        return {
            ...obj,
            returnMode: obj.returnMode ?? 'static',
            staticReturn: obj.staticReturn ?? ''
        };
    }

    /**
     * Pattern accepted as a tool name by most LLM providers (e.g. OpenAI, Anthropic).
     * The name is also used as the id under which the tool is registered, so it must be unique.
     */
    export const NAME_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

    /**
     * Validates a tool name for use as a registered tool id.
     *
     * @param name the name to validate
     * @param existingTools the currently defined tools, used to check for name collisions
     * @param selfId the id of the tool being edited, so it is not compared against itself
     * @returns a localized error message if the name is invalid, otherwise `undefined`
     */
    export function validateName(name: string, existingTools: SketchedToolDefinition[], selfId?: string): string | undefined {
        const trimmed = name.trim();
        if (!trimmed) {
            return nls.localize('theia/ai-tool-sketchpad/nameEmpty', 'Tool name must not be empty.');
        }
        if (!NAME_PATTERN.test(trimmed)) {
            return nls.localize('theia/ai-tool-sketchpad/nameInvalid',
                'Tool name may only contain letters, digits, underscores and hyphens (1-128 characters).');
        }
        if (existingTools.some(tool => tool.id !== selfId && tool.name.trim() === trimmed)) {
            return nls.localize('theia/ai-tool-sketchpad/nameDuplicate', 'A tool with this name already exists.');
        }
        return undefined;
    }
}

export const SKETCHED_TOOLS_PROVIDER_NAME = 'ai-tool-sketchpad';

export const SketchedToolService = Symbol('SketchedToolService');
export interface SketchedToolService {
    getSketchedTools(): SketchedToolDefinition[];
    addSketchedTool(tool: SketchedToolDefinition): Promise<void>;
    updateSketchedTool(tool: SketchedToolDefinition): Promise<void>;
    removeSketchedTool(toolId: string): Promise<void>;
    onDidChangeSketchedTools: Event<void>;
}
