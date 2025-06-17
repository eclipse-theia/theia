// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { TokenUsageServiceClient } from './protocol';

export const TokenUsageService = Symbol('TokenUsageService');

export interface TokenUsage {
    /** The input token count */
    inputTokens: number;
    /** The output token count */
    outputTokens: number;
    /** Input tokens written to cache */
    cachedInputTokens?: number;
    /** Input tokens read from cache */
    readCachedInputTokens?: number;
    /** The model identifier */
    model: string;
    /** The timestamp of when the tokens were used */
    timestamp: Date;
    /** Request identifier */
    requestId: string;
}

export interface TokenUsageParams {
    /** The input token count */
    inputTokens: number;
    /** The output token count */
    outputTokens: number;
    /** Input tokens placed in cache */
    cachedInputTokens?: number;
    /** Input tokens read from cache */
    readCachedInputTokens?: number;
    /** Request identifier */
    requestId: string;
}

export interface TokenUsageService {
    /**
     * Records token usage for a model interaction.
     *
     * @param model The identifier of the model that was used
     * @param params Object containing token usage information
     * @returns A promise that resolves when the token usage has been recorded
     */
    recordTokenUsage(model: string, params: TokenUsageParams): Promise<void>;

    getTokenUsages(): Promise<TokenUsage[]>;

    setClient(tokenUsageClient: TokenUsageServiceClient): void;
}
