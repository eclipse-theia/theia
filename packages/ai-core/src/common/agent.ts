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

import { LanguageModelRequirement } from './language-model';
import { PromptTemplate } from './prompt-service';

export interface AgentSpecificVariables {
    name: string;
    description: string;
    usedInPrompt: boolean;
}

export const Agent = Symbol('Agent');
/**
 * Agents represent the main functionality of the AI system. They are responsible for processing user input, collecting information from the environment,
 * invoking and processing LLM responses, and providing the final response to the user while recording their actions in the AI history.
 *
 * Agents are meant to cover all use cases, from specialized scenarios to general purpose chat bots.
 *
 * Agents are encouraged to provide a detailed description of their functionality and their processed inputs.
 * They can also declare their used prompt templates, which makes them configurable for the user.
 */
export interface Agent {
    /**
     * Used to identify an agent, e.g. when it is requesting language models, etc.
     *
     * @note This parameter might be removed in favor of `name`. Therefore, it is recommended to set `id` to the same value as `name` for now.
     */
    readonly id: string;

    /**
     * Human-readable name shown to users to identify the agent. Must be unique.
     * Use short names without "Agent" or "Chat" (see `tags` for adding further properties).
     */
    readonly name: string;

    /** A markdown description of its functionality and its privacy-relevant requirements, including function call handlers that access some data autonomously. */
    readonly description: string;

    /** The list of global variable identifiers this agent needs to clarify its context requirements. See #39. */
    readonly variables: string[];

    /** The prompt templates introduced and used by this agent. */
    readonly promptTemplates: PromptTemplate[];

    /** Required language models. This includes the purpose and optional language model selector arguments. See #47. */
    readonly languageModelRequirements: LanguageModelRequirement[];

    /** A list of tags to filter agents and to display capabilities in the UI */
    readonly tags?: String[];

    /** The list of local variable identifiers this agent needs to clarify its context requirements. */
    readonly agentSpecificVariables: AgentSpecificVariables[];

    /** The list of global function identifiers this agent needs to clarify its context requirements. */
    readonly functions: string[];
}
