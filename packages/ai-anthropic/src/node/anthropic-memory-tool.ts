// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { betaMemoryTool, BetaLocalFilesystemMemoryTool } from '@anthropic-ai/sdk/tools/memory/node';
import type { BetaMemoryTool20250818Command } from '@anthropic-ai/sdk/resources/beta';

/** The name of the memory tool. */
export const MEMORY_TOOL_NAME = 'memory';
/** The type identifier of Anthropic's built-in memory tool. */
export const MEMORY_TOOL_TYPE = 'memory_20250818';

/**
 * Executes the commands of Anthropic's built-in memory tool (`memory_20250818`) using the local filesystem
 * implementation of the Anthropic SDK ({@link BetaLocalFilesystemMemoryTool}). The SDK implementation maps the
 * model's virtual `/memories` directory to a `memories` subdirectory of the configured folder and protects
 * against directory traversal and symlink escapes.
 *
 * Results and errors are returned as plain strings to be sent back to the model as `tool_result` content;
 * {@link execute} never throws.
 */
export class AnthropicMemoryTool {

    constructor(protected readonly memoryFolder: string) { }

    async execute(argsJson: string): Promise<string> {
        let input: BetaMemoryTool20250818Command;
        try {
            input = JSON.parse(argsJson);
        } catch {
            return 'Error: Invalid memory tool input. Expected a JSON object.';
        }
        if (typeof input !== 'object' || !input) {
            return 'Error: Invalid memory tool input. Expected a JSON object.';
        }
        try {
            const backend = await BetaLocalFilesystemMemoryTool.init(this.memoryFolder);
            const result = await betaMemoryTool(backend).run(input);
            return typeof result === 'string' ? result : JSON.stringify(result);
        } catch (error) {
            return `Error: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
}
