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

export const TODO_WRITE_FUNCTION_ID = 'todoWrite';

export interface TodoItem {
    content: string;
    activeForm: string;
    status: 'pending' | 'in_progress' | 'completed';
}

export function isValidTodoItem(item: unknown): item is TodoItem {
    if (!item || typeof item !== 'object') {
        return false;
    }
    const obj = item as Record<string, unknown>;
    return (
        typeof obj.content === 'string' &&
        typeof obj.activeForm === 'string' &&
        (obj.status === 'pending' || obj.status === 'in_progress' || obj.status === 'completed')
    );
}
