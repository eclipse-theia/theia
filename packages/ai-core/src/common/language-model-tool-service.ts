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
export const languageModelToolServicePath = '/services/languageModelToolService';
export const LanguageModelToolServiceFrontend = Symbol('LanguageModelToolServiceFrontend');
export interface LanguageModelToolServiceFrontend {
    registerToolCallback(agentId: string, callback: (toolId: string, arg_string: string) => unknown): void;
    callTool(agentId: string, toolId: string, arg_string: string): Promise<unknown>;
}
export const LanguageModelToolServer = Symbol('LanguageModelToolServer');
export interface LanguageModelToolServer {
    callTool(agentId: string, toolId: string, arg_string: string): Promise<unknown>;
    setClient(client: LanguageModelToolServiceFrontend): void;
}

/**
 * F/B: agent -> registers at the toolservice
 * RPCClient: llm -> notifies the toolservice that a tool was called
 * F/B: toolservice -> notifies the agent that a tool was called
 * F/B: agent returns the tool call result -> toolservice
 * RPCCLient: toolservice -> notifies llm about toolcall result
 * 
 */
