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
import { PromptTemplate } from './types';

export const Agent = Symbol('Agent');
export interface Agent {
    /** Used to identify an agent, e.g. when it is requesting language models, etc. */
    readonly id: string;

    /** Human-readable name shown to users to identify the agent. */
    readonly name: string;

    /** A markdown description of its functionality and its privacy-relevant requirements, including function call handlers that access some data autonomously. */
    readonly description: string;

    /** The list of variable identifiers this agent needs to clarify its context requirements. See #39. */
    readonly variables: string[];

    /** The prompt templates introduced and used by this agent. */
    readonly promptTemplates: PromptTemplate[];

    /** Required language models. This includes the purpose and optional language model selector arguments. See #47. */
    readonly languageModelRequirements: LanguageModelRequirement[];
}
