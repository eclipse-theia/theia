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

import { CancellationToken } from '@theia/core';
import {
    LanguageModelMetaData, LanguageModelParsedResponse, LanguageModelRequest, LanguageModelStreamResponsePart,
    LanguageModelTextResponse, ToolCallResult
} from './language-model';

export const LanguageModelDelegateClient = Symbol('LanguageModelDelegateClient');
export interface LanguageModelDelegateClient {
    toolCall(requestId: string, toolId: string, args_string: string): Promise<ToolCallResult>;
    send(id: string, token: LanguageModelStreamResponsePart | undefined): void;
    error(id: string, error: Error): void;
}
export const LanguageModelRegistryFrontendDelegate = Symbol('LanguageModelRegistryFrontendDelegate');
export interface LanguageModelRegistryFrontendDelegate {
    getLanguageModelDescriptions(): Promise<LanguageModelMetaData[]>;
}

export interface LanguageModelStreamResponseDelegate {
    streamId: string;
}
export const isLanguageModelStreamResponseDelegate = (obj: unknown): obj is LanguageModelStreamResponseDelegate =>
    !!(obj && typeof obj === 'object' && 'streamId' in obj && typeof (obj as { streamId: unknown }).streamId === 'string');

export type LanguageModelResponseDelegate = LanguageModelTextResponse | LanguageModelParsedResponse | LanguageModelStreamResponseDelegate;

export const LanguageModelFrontendDelegate = Symbol('LanguageModelFrontendDelegate');
export interface LanguageModelFrontendDelegate {
    cancel(requestId: string): void;
    request(modelId: string, request: LanguageModelRequest, requestId: string, cancellationToken?: CancellationToken): Promise<LanguageModelResponseDelegate>;
}

export const languageModelRegistryDelegatePath = '/services/languageModelRegistryDelegatePath';
export const languageModelDelegatePath = '/services/languageModelDelegatePath';
