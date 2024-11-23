// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
//

import { injectable } from '@theia/core/shared/inversify';
import * as yaml from 'js-yaml';

export interface CodeCompletionPromptMetaData {
    requestSettings?: Record<string, unknown>;
}

export namespace CodeCompletionPromptMetaData {
    export function isStrict(entry: unknown): entry is CodeCompletionPromptMetaData {
        // eslint-disable-next-line no-null/no-null
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
            return false;
        }

        const keys = Object.keys(entry);

        const validKeys = ['requestSettings'];
        if (!keys.every(key => validKeys.includes(key))) {
            return false;
        }

        if ('requestSettings' in entry) {
            const requestSettings = (entry as CodeCompletionPromptMetaData).requestSettings;
            // eslint-disable-next-line no-null/no-null
            if (requestSettings === null || typeof requestSettings !== 'object' || Array.isArray(requestSettings)) {
                return false;
            }
        }

        return true;
    }
}

export const CodeCompletionPromptParserService = Symbol('CodeCompletionPromptParserService');

export interface CodeCompletionPromptParserService {
    /**
     * Parses a prompt template as a string input.
     * If valid metadata is found, it is returned, and the metadata section is removed from the prompt.
     * @param prompt - The prompt template to parse.
     * @returns An object containing:
     *   - `metadata`: The parsed CodeCompletionPromptMetaData or undefined if no valid metadata is found.
     *   - `prompt`: The modified prompt string with the metadata section removed (if valid metadata was found).
     */
    parse(prompt: string): { metadata: CodeCompletionPromptMetaData | undefined; prompt: string };
}

@injectable()
export class DefaultCodeCompletionPromptParserService implements CodeCompletionPromptParserService {
    parse(prompt: string): { metadata: CodeCompletionPromptMetaData | undefined; prompt: string } {
        if (!prompt) {
            return { metadata: undefined, prompt };
        }

        const lines = prompt.split('\n');

        if (!lines[0].trim().startsWith('---')) {
            return { metadata: undefined, prompt };
        }

        const closingIndex = lines.indexOf('---', 1);
        if (closingIndex === -1) {
            return { metadata: undefined, prompt };
        }

        const metaDataLines = lines.slice(1, closingIndex).join('\n');

        try {
            const parsedData = yaml.load(metaDataLines);

            if (!CodeCompletionPromptMetaData.isStrict(parsedData)) {
                return { metadata: undefined, prompt };
            }

            // Remove the metadata section from the prompt
            const modifiedPrompt = lines.slice(closingIndex + 1).join('\n');

            return { metadata: parsedData, prompt: modifiedPrompt };
        } catch {
            return { metadata: undefined, prompt };
        }
    }
}
