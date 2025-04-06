// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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
    LanguageModelRequest,
    LanguageModelResponse,
    LanguageModelStreamResponse,
    LanguageModelStreamResponsePart,
} from './language-model';

/**
 * A session tracking raw exchanges with language models, organized into exchange units.
 */
export interface LanguageModelSession {
    /**
     * Identifier of this Language Model Session. Corresponds to Chat session ids
     */
    id: string;
    /**
     * All exchange units part of this session
     */
    exchanges: LanguageModelExchange[];
}

/**
 * An exchange unit representing a logical operation which may involve multiple model requests.
 */
export interface LanguageModelExchange {
    /**
     * Identifier of the exchange unit.
     */
    id: string;
    /**
     * All requests that constitute this exchange
     */
    requests: LanguageModelExchangeRequest[];
    /**
     * Arbitrary metadata for the exchange
     */
    metadata: {
        agent?: string;
        [key: string]: unknown;
    }
}

/**
 * Alternative to the LanguageModelStreamResponse, suited for inspection
 */
export interface LanguageModelMonitoredStreamResponse {
    parts: LanguageModelStreamResponsePart[];
}

/**
 * Alternative to the LanguageModelResponse, suited for inspection
 */
export type LanguageModelExchangeRequestResponse = Exclude<LanguageModelResponse, LanguageModelStreamResponse> | LanguageModelMonitoredStreamResponse;

/**
 * Represents a request to a language model within an exchange unit, capturing the request and its response.
 */
export interface LanguageModelExchangeRequest {
    /**
     * Identifier of the request. Might share the id with the parent exchange if there's only one request.
     */
    id: string;
    /**
     * The actual request sent to the language model
     */
    request: LanguageModelRequest;
    /**
     * Arbitrary metadata for the request. Might contain an agent id and timestamp.
     */
    metadata: {
        agent?: string;
        timestamp?: number;
        [key: string]: unknown;
    };
    /**
     * The identifier of the language model the request was sent to
     */
    languageModel: string;
    /**
     * The recorded response
     */
    response: LanguageModelExchangeRequestResponse;
}
