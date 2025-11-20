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

import { Command } from '@theia/core';

export const AI_SUMMARIZE_SESSION_AS_TASK_FOR_CODER = Command.toLocalizedCommand({
    id: 'ai-chat:summarize-session-as-task-for-coder',
    label: 'Summarize Session as Task for Coder'
});

export const AI_UPDATE_TASK_CONTEXT_COMMAND = Command.toLocalizedCommand({
    id: 'ai.updateTaskContext',
    label: 'Update Current Task Context'
});
