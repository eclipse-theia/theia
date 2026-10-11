// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { Command } from '@theia/core/lib/common/command';

/** Opens the AI getting started walkthrough, from the chat view, a menu or the command palette. */
export const AI_OPEN_GETTING_STARTED_WALKTHROUGH = Command.toLocalizedCommand({
    id: 'ai.openGettingStartedWalkthrough',
    label: 'Get Started with AI'
}, 'theia/ai/ide/openGettingStartedWalkthrough');

/**
 * Sets the default chat agent to the agent id passed as the first argument.
 * Lets the walkthrough offer the recommended agents as one click each, rather than sending the user to the
 * preference row to pick one there.
 */
export const AI_SET_DEFAULT_CHAT_AGENT = Command.toLocalizedCommand({
    id: 'ai.setDefaultChatAgent',
    label: 'Set Default Chat Agent'
}, 'theia/ai/ide/setDefaultChatAgent');
