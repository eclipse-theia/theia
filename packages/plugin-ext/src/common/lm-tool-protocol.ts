// *****************************************************************************
// Copyright (C) 2026 EclipseSource.
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

import { CancellationToken } from '@theia/core/lib/common/cancellation';

export interface LanguageModelToolDto {
    name: string;
    description?: string;
    inputSchema?: object;
    tags?: string[];
}

export interface ToolResultTextPartDto {
    type: 'text';
    value: string;
}

export interface ToolResultDataPartDto {
    type: 'data';
    base64: string;
    mimeType: string;
}

export interface ToolResultPromptTsxPartDto {
    type: 'prompt-tsx';
    value: unknown;
}

export interface ToolResultUnknownPartDto {
    type: 'unknown';
    json: string;
}

export type ToolResultPartDto = ToolResultTextPartDto | ToolResultDataPartDto | ToolResultPromptTsxPartDto | ToolResultUnknownPartDto;

export interface LanguageModelToolResultDto {
    content: ToolResultPartDto[];
}

export interface LanguageModelToolInvocationErrorDto {
    error: string;
}

export type ToolInvocationResult = LanguageModelToolResultDto | LanguageModelToolInvocationErrorDto;

export const isToolInvocationError = (result: ToolInvocationResult): result is LanguageModelToolInvocationErrorDto =>
    typeof result === 'object' && 'error' in result && !('content' in result);

/**
 * Main side of the language model tools registry.
 */
export interface LanguageModelToolsMain {
    /**
     * Register a language model tool.
     */
    $registerTool(handle: number, name: string, metadata: LanguageModelToolDto, pluginId: string): void;

    /**
     * Unregister a language model tool.
     */
    $unregisterTool(handle: number): void;
}

/**
 * Extension side of the language model tools registry.
 */
export interface LanguageModelToolsExt {
    /**
     * Invoke a language model tool.
     */
    $invokeTool(handle: number, argsString: string, token?: CancellationToken): Promise<ToolInvocationResult>;
}
