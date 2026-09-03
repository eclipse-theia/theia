// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

/**
 * Checks the mirrored Copilot SDK types of `@theia/ai-copilot` against a real `@github/copilot-sdk`.
 *
 * The package is not a dependency of this repository, see `copilot-sdk-types.ts`, so this module is
 * compiled on its own and only when the SDK has been installed for the purpose:
 *
 * ```sh
 * node scripts/copilot-sdk-mirror/run.js
 * ```
 *
 * Every assertion states the direction the type is used in: what this integration hands to the SDK
 * has to be accepted by it, and what it reads from the SDK has to be covered by the mirror. A mismatch
 * fails the compilation with the member that drifted.
 */

import type * as Sdk from '@github/copilot-sdk';
import type * as Mirror from '../../packages/ai-copilot/src/node/copilot-sdk-types';

declare function value<T>(): T;

// Passed to the SDK.
export const options: Sdk.CopilotClientOptions = value<Mirror.CopilotClientOptions>();
export const sessionConfig: Sdk.SessionConfig = value<Mirror.SessionConfig>();
export const tool: Sdk.Tool = value<Mirror.Tool>();
export const systemMessage: Sdk.SystemMessageConfig = value<Mirror.SystemMessageConfig>();
export const permissionHandler: Sdk.PermissionHandler = value<Mirror.PermissionHandler>();
export const connection: Sdk.RuntimeConnection = value<Mirror.StdioRuntimeConnection>();
export const section: Sdk.SystemMessageSection = value<Mirror.SystemMessageSection>();
export const decision: Sdk.PermissionRequestResult = value<Mirror.PermissionRequestResult>();

// Read from the SDK.
export const models: Mirror.ModelInfo[] = value<Sdk.ModelInfo[]>();
export const client: Mirror.CopilotClient = value<Sdk.CopilotClient>();
export const session: Mirror.CopilotSession = value<Sdk.CopilotSession>();
export const clientConstructor: Mirror.CopilotClientConstructor = value<typeof Sdk.CopilotClient>();
export const runtimeConnection: Mirror.RuntimeConnectionFactory = value<typeof Sdk.RuntimeConnection>();
export const invocation: Mirror.ToolInvocation = value<Sdk.ToolInvocation>();
export const request: Mirror.PermissionRequest = value<Sdk.PermissionRequest>();
export const sectionUpstream: Mirror.SystemMessageSection = value<Sdk.SystemMessageSection>();

// Returned by the members that are called, which the assertions above compare bivariantly.
export const listed: Promise<Mirror.ModelInfo[]> = value<ReturnType<Sdk.CopilotClient['listModels']>>();
export const created: Promise<Mirror.CopilotSession> = value<ReturnType<Sdk.CopilotClient['createSession']>>();
export const sent: Promise<string> = value<ReturnType<Sdk.CopilotSession['send']>>();
export const sessionId: string = value<Sdk.CopilotSession['sessionId']>();

// Payload of every event that is listened to, which the session assertion does not cover either.
type Payload<K extends Sdk.SessionEventType> = Sdk.SessionEventPayload<K>;
export const messageDelta: Mirror.CopilotSessionEvents['assistant.message_delta'] = value<Payload<'assistant.message_delta'>>();
export const reasoningDelta: Mirror.CopilotSessionEvents['assistant.reasoning_delta'] = value<Payload<'assistant.reasoning_delta'>>();
export const assistantMessage: Mirror.CopilotSessionEvents['assistant.message'] = value<Payload<'assistant.message'>>();
export const usage: Mirror.CopilotSessionEvents['assistant.usage'] = value<Payload<'assistant.usage'>>();
export const idle: Mirror.CopilotSessionEvents['session.idle'] = value<Payload<'session.idle'>>();
export const sessionError: Mirror.CopilotSessionEvents['session.error'] = value<Payload<'session.error'>>();
