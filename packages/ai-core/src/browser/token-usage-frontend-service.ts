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

import { Event } from '@theia/core';

/**
 * Data structure for token usage data specific to a model.
 */
export interface ModelTokenUsageData {
    /** The model identifier */
    modelId: string;
    /** Number of input tokens used */
    inputTokens: number;
    /** Number of output tokens used */
    outputTokens: number;
    /** Number of input tokens written to cache */
    cachedInputTokens?: number;
    /** Number of input tokens read from cache */
    readCachedInputTokens?: number;
    /** Date when the model was last used */
    lastUsed?: Date;
}

/**
 * Service for managing token usage data on the frontend.
 */
export const TokenUsageFrontendService = Symbol('TokenUsageFrontendService');
export interface TokenUsageFrontendService {
    /**
     * Event emitted when token usage data is updated
     */
    readonly onTokenUsageUpdated: Event<ModelTokenUsageData[]>;

    /**
     * Gets the current token usage data for all models
     */
    getTokenUsageData(): Promise<ModelTokenUsageData[]>;
}
