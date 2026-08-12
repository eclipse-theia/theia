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

import { LanguageModelMessage } from '@theia/ai-core';
import { injectable } from '@theia/core/shared/inversify';
import { DeveloperMessageSettings } from '@theia/ai-openai/lib/node/openai-language-model';
import { OpenAiResponseApiUtils } from '@theia/ai-openai/lib/node/openai-response-api-utils';
import type { ResponseInputItem } from 'openai/resources/responses/responses';

/** Used when a request carries no system message, which the ChatGPT endpoint rejects with `Instructions are required`. */
export const DEFAULT_CHATGPT_INSTRUCTIONS = 'You are a helpful assistant.';

/**
 * Adapts the OpenAI Response API request to the additional constraints of the ChatGPT endpoint.
 * Bound under its own symbol so the plain OpenAI models keep using {@link OpenAiResponseApiUtils}.
 */
@injectable()
export class ChatGptResponseApiUtils extends OpenAiResponseApiUtils {

    override processMessages(
        messages: LanguageModelMessage[],
        developerMessageSettings: DeveloperMessageSettings,
        model: string
    ): { instructions?: string; input: ResponseInputItem[] } {
        const processed = super.processMessages(messages, developerMessageSettings, model);
        return processed.instructions?.trim()
            ? processed
            : { ...processed, instructions: DEFAULT_CHATGPT_INSTRUCTIONS };
    }
}
