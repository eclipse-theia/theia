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
// Type-only import: keeps this module free of any runtime dependency on the
// Copilot SDK so the pure mappers can be unit-tested without the CLI installed.
import type { ModelInfo } from '@github/copilot-sdk';

/**
 * Selects the model IDs that should be surfaced to Theia from the list returned
 * by `CopilotClient.listModels()`.
 *
 * Models whose policy is explicitly `disabled` are filtered out; `enabled` and
 * `unconfigured` models are kept. Order is preserved and duplicates are removed.
 */
export function selectSdkModelIds(models: ModelInfo[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const model of models) {
        if (!model.id || seen.has(model.id)) {
            continue;
        }
        if (model.policy && model.policy.state === 'disabled') {
            continue;
        }
        seen.add(model.id);
        result.push(model.id);
    }
    return result;
}

/**
 * The result of flattening a Theia message history into a single prompt for the
 * agentic Copilot SDK session.
 */
export interface SdkPrompt {
    /** Concatenated content of all system messages (may be empty). */
    systemText: string;
    /** The user-facing prompt body derived from the non-system messages. */
    prompt: string;
}

function roleLabel(message: LanguageModelMessage): string {
    switch (message.actor) {
        case 'ai':
            return 'Assistant';
        case 'system':
            return 'System';
        default:
            return 'User';
    }
}

function messageToText(message: LanguageModelMessage): string {
    if (LanguageModelMessage.isTextMessage(message)) {
        return message.text;
    }
    if (LanguageModelMessage.isToolUseMessage(message)) {
        return `[tool call: ${message.name} ${JSON.stringify(message.input)}]`;
    }
    if (LanguageModelMessage.isToolResultMessage(message)) {
        const content = message.content === undefined
            ? ''
            : (typeof message.content === 'string' ? message.content : JSON.stringify(message.content));
        return `[tool result: ${content}]`;
    }
    if (LanguageModelMessage.isImageMessage(message)) {
        return '[image omitted]';
    }
    return '';
}

/**
 * Flattens a Theia message history into an {@link SdkPrompt}.
 *
 * The Copilot SDK session is a stateful agent that accepts a single prompt
 * string per `send()` call, so the full Theia history is collapsed here. System
 * messages are extracted separately. A lone user turn is forwarded verbatim;
 * richer histories are rendered as a role-labelled transcript.
 *
 * This is a lossy mapping by design (see the prototype limitations documented in
 * the package README) and is intended for single-turn requests.
 */
export function buildSdkPrompt(messages: LanguageModelMessage[]): SdkPrompt {
    const systemParts: string[] = [];
    const conversation: LanguageModelMessage[] = [];
    for (const message of messages) {
        if (message.actor === 'system' && LanguageModelMessage.isTextMessage(message)) {
            systemParts.push(message.text);
        } else if (message.type !== 'thinking') {
            conversation.push(message);
        }
    }

    const systemText = systemParts.join('\n\n').trim();

    let prompt: string;
    if (conversation.length === 1 && LanguageModelMessage.isTextMessage(conversation[0]) && conversation[0].actor === 'user') {
        prompt = conversation[0].text;
    } else {
        prompt = conversation
            .map(message => `${roleLabel(message)}: ${messageToText(message)}`)
            .join('\n\n')
            .trim();
    }

    return { systemText, prompt };
}

/**
 * Combines the system text and prompt body of an {@link SdkPrompt} into the
 * single string handed to `session.send({ prompt })`.
 */
export function flattenSdkPrompt(sdkPrompt: SdkPrompt): string {
    if (sdkPrompt.systemText) {
        return `${sdkPrompt.systemText}\n\n${sdkPrompt.prompt}`.trim();
    }
    return sdkPrompt.prompt;
}
