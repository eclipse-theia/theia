// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { Agent } from '@theia/ai-core';
import { nls } from '@theia/core';
import * as React from '@theia/core/shared/react';
import { getAgentIconClass } from '../agent-icon';

/** A single navigable agent chip (icon + name); shared by the Variables, Skills and Slash Command surfaces. */
export const AgentChip: React.FC<{ agent: Agent; onOpenAgent: (agentId: string) => void }> = ({ agent, onOpenAgent }) => {
    const label = nls.localize('theia/ai/ide/variableConfiguration/openAgent', 'Open agent {0}', agent.name);
    return <button
        type='button'
        className='agent-chip'
        aria-label={label}
        title={label}
        onClick={event => {
            event.stopPropagation();
            onOpenAgent(agent.id);
        }}
    >
        <span aria-hidden='true' className={getAgentIconClass(agent)}></span>
        {agent.name}
    </button>;
};

export interface AgentChipsProps {
    readonly agents: Agent[];
    /** Navigates to an agent's detail page when a chip is activated. */
    readonly onOpenAgent: (agentId: string) => void;
}

/** A row of navigable {@link AgentChip}s. */
export const AgentChips: React.FC<AgentChipsProps> = ({ agents, onOpenAgent }) => (
    <div className='agent-chips-container'>
        {agents.map(agent => <AgentChip key={agent.id} agent={agent} onOpenAgent={onOpenAgent} />)}
    </div>
);
