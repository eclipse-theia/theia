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

import type {
    ThreadEvent,
    ThreadOptions
} from '@openai/codex-sdk';

export const CODEX_SERVICE_PATH = '/services/codex';

export interface CodexRequest {
    prompt: string;
    options?: Partial<ThreadOptions>;
    sessionId?: string;
    sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
}

export interface CodexBackendRequest extends CodexRequest {
    apiKey?: string;
    sessionId?: string;
}

export const CodexClient = Symbol('CodexClient');
export interface CodexClient {
    sendToken(streamId: string, token?: ThreadEvent): void;
    sendError(streamId: string, error: Error): void;
}

export const CodexService = Symbol('CodexService');
export interface CodexService {
    send(request: CodexBackendRequest, streamId: string): Promise<void>;
    cancel(streamId: string): void;
}
