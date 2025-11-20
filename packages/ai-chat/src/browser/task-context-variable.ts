// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import { AIVariable } from '@theia/ai-core';
import { nls } from '@theia/core';
import { codiconArray } from '@theia/core/lib/browser';

export const TASK_CONTEXT_VARIABLE: AIVariable = {
    id: 'taskContext',
    description: nls.localize('theia/chat/taskContextVariable/description',
        'Provides context information for a task, e.g. the plan for completing a task or a summary of a previous sessions'),
    name: 'taskContext',
    label: nls.localize('theia/chat/taskContextVariable/label', 'Task Context'),
    iconClasses: codiconArray('clippy'),
    isContextVariable: true,
    args: [{
        name: 'context-id',
        description: nls.localize('theia/chat/taskContextVariable/args/contextId/description', 'The ID of the task context to retrieve, or a chat session to summarize.')
    }]
};
