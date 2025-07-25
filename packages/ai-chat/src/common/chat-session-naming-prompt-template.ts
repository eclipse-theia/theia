/* eslint-disable @typescript-eslint/tslint/config */
// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
//
// This file is licensed under the MIT License.
// See LICENSE-MIT.txt in the project root for license information.
// https://opensource.org/license/mit.
//
// SPDX-License-Identifier: MIT
// *****************************************************************************

import { PromptVariantSet } from '@theia/ai-core';

export const CHAT_SESSION_NAMING_PROMPT: PromptVariantSet = {
    id: 'chat-session-naming-system',
    defaultVariant: {
        id: 'chat-session-naming-system-default',
        template: '{{!-- This prompt is licensed under the MIT License (https://opensource.org/license/mit).\n' +
            'Made improvements or adaptations to this prompt template? We\'d love for you to share it with the community! Contribute back here: ' +
            'https://github.com/eclipse-theia/theia/discussions/new?category=prompt-template-contribution --}}\n\n' +
            'Provide a short and descriptive name for the given AI chat conversation of an AI-powered tool based on the conversation below.\n\n' +
            'The purpose of the name is for users to recognize the chat conversation easily in a list of conversations. ' +
            'Use the same language for the chat conversation name as used in the provided conversation, if in doubt default to English. ' +
            'Start the chat conversation name with an upper-case letter. ' +
            'Below we also provide the already existing other conversation names, make sure your suggestion for a name is unique with respect to the existing ones.\n\n' +
            'IMPORTANT: Your answer MUST ONLY CONTAIN THE PROPOSED NAME and must not be preceded or followed by any other text.' +
            '\n\nOther session names:\n{{listOfSessionNames}}' +
            '\n\nConversation:\n{{conversation}}',
    }
};
