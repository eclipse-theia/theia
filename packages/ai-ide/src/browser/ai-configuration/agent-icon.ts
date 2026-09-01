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

import { Agent } from '@theia/ai-core/lib/common';
import { isChatAgent } from '@theia/ai-chat/lib/common';
import { codicon } from '@theia/core/lib/browser';

/**
 * The icon used throughout the AI configuration view for agents that do not
 * contribute their own icon. Matches the framework default of {@link AbstractChatAgent}
 * so that agents without a custom icon look consistent everywhere.
 */
export const DEFAULT_AGENT_ICON_CLASS = codicon('copilot');

/**
 * Resolves the icon class to use for an agent in the AI configuration view.
 *
 * Only chat agents can contribute an icon (via `iconClass`); when an agent
 * contributes one it is used, otherwise the shared {@link DEFAULT_AGENT_ICON_CLASS}
 * is applied so agents are rendered consistently across chips, tree nodes and detail views.
 */
export function getAgentIconClass(agent: Agent): string {
    return (isChatAgent(agent) && agent.iconClass) ? agent.iconClass : DEFAULT_AGENT_ICON_CLASS;
}
