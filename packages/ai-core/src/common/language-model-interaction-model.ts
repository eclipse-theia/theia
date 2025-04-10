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
    LanguageModelParsedResponse,
    LanguageModelRequest,
    LanguageModelStreamResponsePart,
    LanguageModelTextResponse
} from './language-model';

/**
 * An AI session tracks raw LLM interaction data, grouped into semantical requests.
 */
export interface AiSession {
    /**
     * Identifer of this AI Session. Will correspond to Chat session ids
     */
    id: string;
    /**
     * All semantic requests part of this sessions
     */
    requests: AiSemanticRequest[];
}
/**
 * One logical request can be split into multiple requests to different language models
 */
export interface AiSemanticRequest {
    /**
     * Identifier of the semantic request. Will correspond to Chat request ids
     */
    id: string;
    /**
     * All raw requests which constitute this semantic request. Will be a single one for a "default" Chat request.
     */
    requests: AiRequest[];
    /**
     * Arbitrary metadata for the request
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
    parts: LanguageModelStreamResponsePart[]
}

/**
 * The AiRequest interface represents a request to an AI language model, tracking all raw data exchanged
 */
export interface AiRequest {
    /**
     * Identifier of the request. Might have the same id as the parent semantic request, in case there is only one request or there being a root/seed request.
     */
    id: string;
    /**
     * The actual request sent to the language model
     */
    request: LanguageModelRequest;
    /**
     * Arbitrary metadata for the request. Might contain the agent id
     */
    metadata: {
        agent?: string;
        timestamp?: number;
        [key: string]: unknown;
    }
    /**
     * The identifier of the language model the request was sent to
     */
    languageModel: string;
    /**
     * The recorded response
     */
    response: LanguageModelTextResponse | LanguageModelParsedResponse | LanguageModelMonitoredStreamResponse;
}
