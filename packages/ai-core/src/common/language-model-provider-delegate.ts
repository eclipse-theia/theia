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

import { LanguageModelProviderDescription, LanguageModelRequest, LanguageModelStreamResponsePart, LanguageModelTextResponse } from './language-model-provider';

export const LanguageModelProviderDelegateClient = Symbol('LanguageModelProviderDelegateClient');
export interface LanguageModelProviderDelegateClient {
    send(id: string, token: LanguageModelStreamResponsePart | undefined): void;
}
export const LanguageModelProviderRegistryFrontendDelegate = Symbol('LanguageModelProviderRegistryFrontendDelegate');
export interface LanguageModelProviderRegistryFrontendDelegate {
    getLanguageModelProviderDescriptions(): Promise<LanguageModelProviderDescription[]>;
}

export interface LanguageModelStreamResponseDelegate {
    streamId: string;
}
export const isLanguageModelStreamResponseDelegate = (obj: unknown): obj is LanguageModelStreamResponseDelegate =>
    !!(obj && typeof obj === 'object' && 'streamId' in obj && typeof (obj as { streamId: unknown }).streamId === 'string');

export type LanguageModelResponseDelegate = LanguageModelTextResponse | LanguageModelStreamResponseDelegate;

export const LanguageModelProviderFrontendDelegate = Symbol('LanguageModelProviderFrontendDelegate');
export interface LanguageModelProviderFrontendDelegate {
    request(modelId: string, request: LanguageModelRequest): Promise<LanguageModelResponseDelegate>;
}

export const languageModelProviderRegistryDelegatePath = '/services/languageModelProviderRegistryDelegate';
export const languageModelProviderDelegatePath = '/services/languageModelProviderDelegate';
