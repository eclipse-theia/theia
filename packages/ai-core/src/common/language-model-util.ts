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
// *****************************************************************************

import {
    isLanguageModelParsedResponse,
    isLanguageModelStreamResponse,
    isLanguageModelTextResponse,
    isTextResponsePart,
    LanguageModelMetaData,
    LanguageModelResponse,
    ToolRequest
} from './language-model';
import { LanguageModelMonitoredStreamResponse } from './language-model-interaction-model';

/**
 * Retrieves the text content from a `LanguageModelResponse` object.
 *
 * **Important:** For stream responses, the stream can only be consumed once. Calling this function multiple times on the same stream response will return an empty string (`''`)
 * on subsequent calls, as the stream will have already been consumed.
 *
 * @param {LanguageModelResponse} response - The response object, which may contain a text, stream, or parsed response.
 * @returns {Promise<string>} - A promise that resolves to the text content of the response.
 * @throws {Error} - Throws an error if the response type is not supported or does not contain valid text content.
 */
export const getTextOfResponse = async (response: LanguageModelResponse | LanguageModelMonitoredStreamResponse): Promise<string> => {
    if (isLanguageModelTextResponse(response)) {
        return response.text;
    } else if (isLanguageModelStreamResponse(response)) {
        let result = '';
        for await (const chunk of response.stream) {
            result += (isTextResponsePart(chunk) && chunk.content) ? chunk.content : '';
        }
        return result;
    } else if (isLanguageModelParsedResponse(response)) {
        return response.content;
    } else if ('parts' in response) {
        // Handle monitored stream response
        let result = '';
        for (const chunk of response.parts) {
            result += (isTextResponsePart(chunk) && chunk.content) ? chunk.content : '';
        }
        return result;
    }
    throw new Error(`Invalid response type ${response}`);
};

export const getJsonOfResponse = async (response: LanguageModelResponse | LanguageModelMonitoredStreamResponse): Promise<unknown> => {
    const text = await getTextOfResponse(response);
    return getJsonOfText(text);
};

export const getJsonOfText = (text: string): unknown => {
    if (text.startsWith('```json')) {
        const regex = /```json\s*([\s\S]*?)\s*```/g;
        let match;
        // eslint-disable-next-line no-null/no-null
        while ((match = regex.exec(text)) !== null) {
            try {
                return JSON.parse(match[1]);
            } catch (error) {
                console.error('Failed to parse JSON:', error);
            }
        }
    } else if (text.startsWith('{') || text.startsWith('[')) {
        return JSON.parse(text);
    }
    throw new Error('Invalid response format');
};

export const toolRequestToPromptText = (toolRequest: ToolRequest): string => `${toolRequest.id}`;

/**
 * Builds an error message string that also incorporates the `cause` chain.
 *
 * Node's `fetch` (undici) throws `TypeError: fetch failed` while the actionable reason
 * (e.g. `ECONNREFUSED`, `ENOTFOUND`, a TLS error) lives on `error.cause`. Provider SDKs often
 * wrap that again. This walks the chain and appends each distinct cause message/code.
 *
 * Because the RPC error extension only serializes `code`, `data`, `message`, `name` and `stack`
 * (see `rpc-message-encoder.ts`), the `cause` is gone by the time a frontend agent sees a backend
 * error. Backend providers must therefore flatten the chain into the `message` *before* re-wrapping
 * or throwing, so the actionable reason survives the RPC boundary. Frontend consumers can still call
 * this defensively for locally thrown errors that keep their `cause`.
 */
export const extractErrorMessageWithCause = (error: unknown): string => {
    const parts: string[] = [];
    const seen = new Set<unknown>();
    let current: unknown = error;
    // Bound the walk to avoid pathological/cyclic cause chains.
    // eslint-disable-next-line no-null/no-null
    for (let depth = 0; current !== undefined && current !== null && depth < 10; depth++) {
        if (seen.has(current)) { break; }
        seen.add(current);

        let segment: string | undefined;
        if (typeof current === 'string') {
            // A string can appear at any depth (e.g. `Object.assign(new Error('fetch failed'),
            // { cause: 'connect ECONNREFUSED 127.0.0.1:11434' })`). Consume it and stop, since a
            // string carries no further `cause` to follow.
            segment = current;
            current = undefined;
        } else if (typeof current === 'object') {
            const obj = current as { message?: unknown; code?: unknown; cause?: unknown };
            const message = typeof obj.message === 'string' ? obj.message : undefined;
            const code = typeof obj.code === 'string' ? obj.code : undefined;
            // Include the code when it is not already part of the message (undici puts the code on
            // the cause but not always in its message).
            segment = code && (!message || !message.includes(code))
                ? [message, code].filter(Boolean).join(': ')
                : message;
            current = obj.cause;
        } else {
            break;
        }

        if (segment && !parts.includes(segment)) {
            parts.push(segment);
        }
    }

    return parts.join(' | ') || String(error);
};

/**
 * Orders models for the lists a user picks from: newest first, since a provider's newest model is
 * almost always the one being looked for, with the id as the tie-break so that models whose provider
 * reports no release date (Gemini reports none) still come out in a stable, readable order.
 */
export const compareModelsByRecency = (left: LanguageModelMetaData, right: LanguageModelMetaData): number => {
    if (left.released !== right.released) {
        // A model without a reported date sorts after the dated ones rather than to the top.
        return (right.released ?? 0) - (left.released ?? 0);
    }
    return left.id.localeCompare(right.id);
};

/**
 * The provider a model belongs to: its declared vendor, falling back to the `<provider>/` prefix of
 * its id. Used to group the model lists so that a provider's models stay together.
 */
export const providerOf = (model: LanguageModelMetaData): string => {
    if (model.vendor) {
        return model.vendor;
    }
    const separator = model.id.indexOf('/');
    return separator > 0 ? model.id.substring(0, separator) : '';
};

/** Groups models by {@link providerOf}, each group ordered by {@link compareModelsByRecency}, groups by provider name. */
export const groupModelsByProvider = <T extends LanguageModelMetaData>(models: T[]): Array<{ provider: string; models: T[] }> => {
    const groups = new Map<string, T[]>();
    for (const model of models) {
        const provider = providerOf(model);
        const group = groups.get(provider);
        if (group) {
            group.push(model);
        } else {
            groups.set(provider, [model]);
        }
    }
    return [...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([provider, grouped]) => ({ provider, models: grouped.slice().sort(compareModelsByRecency) }));
};
