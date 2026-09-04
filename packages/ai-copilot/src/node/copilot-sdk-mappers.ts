// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { ImageContent, LanguageModelMessage } from '@theia/ai-core';
import type { BlobMessageAttachment, ModelInfo, SystemMessageConfig } from './copilot-sdk-types';

/**
 * Recognizes an id that names a dated release of another model, such as
 * `gpt-4o-2024-11-20` or `claude-sonnet-5-20260514` for `gpt-4o` and `claude-sonnet-5`.
 */
const DATED_MODEL_ID = /^(.+?)-(\d{4}-\d{2}-\d{2}|\d{8})$/;

/**
 * Selects the model IDs that should be surfaced to Theia from the list returned
 * by `CopilotClient.listModels()`.
 *
 * Models whose policy is explicitly `disabled` are filtered out; `enabled` and
 * `unconfigured` models are kept. Order is preserved and duplicates are removed.
 *
 * The list can name the same model both by its family and by its dated releases. Offering the user
 * several entries that select the same model is noise, so a dated release is dropped when the family
 * it belongs to is offered as well. It is kept when it is the only way to select that model.
 */
export function selectSdkModelIds(models: ModelInfo[]): string[] {
    const available = new Set(models.filter(model => model.id && model.policy?.state !== 'disabled').map(model => model.id));
    const result: string[] = [];
    const seen = new Set<string>();
    for (const model of models) {
        if (!model.id || seen.has(model.id)) {
            continue;
        }
        if (model.policy && model.policy.state === 'disabled') {
            continue;
        }
        const family = model.id.match(DATED_MODEL_ID)?.[1];
        if (family && available.has(family)) {
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
    /** Base64-encoded images pulled out of the user's messages, sent alongside the prompt. */
    attachments?: BlobMessageAttachment[];
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

/**
 * Whether a message is a user image the SDK can be sent as a blob attachment.
 *
 * URL images are not covered: the SDK's attachments carry inline data, not a remote reference,
 * and fetching the URL on the backend to inline it would add a server-side-request-forgery
 * surface for what is, today, not a use case Theia exercises.
 */
function isAttachableImageMessage(message: LanguageModelMessage): message is LanguageModelMessage & { image: { base64data: string, mimeType: string } } {
    return LanguageModelMessage.isImageMessage(message) && message.actor === 'user' && ImageContent.isBase64(message.image);
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
        // Reached for URL images and non-user image messages; base64 user images are attachments instead, see buildSdkPrompt.
        return '[image omitted]';
    }
    return '';
}

/**
 * Flattens a Theia message history into an {@link SdkPrompt}.
 *
 * The Copilot SDK session is a stateful agent that accepts a single prompt
 * string per `send()` call, so the full Theia history is collapsed here. System
 * messages are extracted separately and become the system message of the session,
 * see {@link buildSdkSystemMessage}. A lone user turn is forwarded verbatim;
 * richer histories are rendered as a role-labelled transcript.
 *
 * Base64 user images are pulled out of the history and sent as blob attachments instead of
 * being flattened into the prompt text, see {@link isAttachableImageMessage}. This is otherwise
 * a lossy mapping by design, see the limitations documented in the package README, and is
 * intended for single-turn requests.
 */
export function buildSdkPrompt(messages: LanguageModelMessage[]): SdkPrompt {
    const systemParts: string[] = [];
    const conversation: LanguageModelMessage[] = [];
    const attachments: BlobMessageAttachment[] = [];
    for (const message of messages) {
        if (message.actor === 'system' && LanguageModelMessage.isTextMessage(message)) {
            systemParts.push(message.text);
        } else if (message.type === 'thinking') {
            continue;
        } else if (isAttachableImageMessage(message)) {
            attachments.push({ type: 'blob', data: message.image.base64data, mimeType: message.image.mimeType });
        } else {
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

    return { systemText, prompt, attachments: attachments.length > 0 ? attachments : undefined };
}

/**
 * Builds the system message configuration of a session from the system text of a request.
 *
 * The CLI is an agent with a system prompt of its own, while a Theia agent brings a complete one.
 * The sections that describe who the agent is and how it should work are therefore removed, so that
 * they cannot contradict the prompt of the Theia agent, and the prompt is added in their place. The
 * sections that make tool calling work and the ones that carry the safety rules of the CLI are kept:
 * this integration declares Theia's tools to the CLI, so the model still has to be told how to call
 * them. Replacing the message as a whole would drop those as well.
 */
export function buildSdkSystemMessage(systemText: string): SystemMessageConfig | undefined {
    if (!systemText) {
        return undefined;
    }
    return {
        mode: 'customize',
        sections: {
            identity: { action: 'remove' },
            tone: { action: 'remove' },
            guidelines: { action: 'remove' },
            code_change_rules: { action: 'remove' }
        },
        content: systemText
    };
}
