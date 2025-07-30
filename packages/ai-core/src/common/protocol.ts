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

import { Event } from '@theia/core';
import { LanguageModelMetaData } from './language-model';
import { TokenUsage } from './token-usage-service';

export const LanguageModelRegistryClient = Symbol('LanguageModelRegistryClient');
export interface LanguageModelRegistryClient {
    languageModelAdded(metadata: LanguageModelMetaData): void;
    languageModelRemoved(id: string): void;
    /**
     * Notify the client that a language model was updated.
     */
    onLanguageModelUpdated(id: string): void;
}

export const TOKEN_USAGE_SERVICE_PATH = '/services/token-usage';

export const TokenUsageServiceClient = Symbol('TokenUsageServiceClient');

export interface TokenUsageServiceClient {
    /**
     * Notify the client about new token usage
     */
    notifyTokenUsage(usage: TokenUsage): void;

    /**
     * An event that is fired when token usage data is updated.
     */
    readonly onTokenUsageUpdated: Event<TokenUsage>;
}
