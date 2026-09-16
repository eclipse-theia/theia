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
