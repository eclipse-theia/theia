/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { Command } from '@theia/core';

export const MemoryCommand: Command = { id: 'memory-inspector-command' };

export const ViewVariableInMemoryCommand: Command = {
    id: 'view-variable-in-memory',
    label: 'Show variable in memory inspector',
};

export const ViewVariableInRegisterViewCommand: Command = {
    id: 'view-variable-in-register-view',
    label: 'Show register in memory inspector',
};

export const ResetModifiedCellCommand: Command = {
    id: 'reset-modified-cell',
    label: 'Reset value',
};

export const CreateNewMemoryViewCommand: Command = {
    id: 'create-new-memory-view',
    label: 'Create new memory inspector',
    iconClass: 'memory-view-icon toolbar',
};

export const FollowPointerTableCommand: Command = {
    id: 'follow-pointer-table',
    label: 'Follow pointer',
};

export const FollowPointerDebugCommand: Command = {
    id: 'follow-pointer-debug',
    label: 'Follow pointer in memory inspector',
};

export const CreateNewRegisterViewCommand: Command = {
    id: 'create-new-register-view',
    label: 'Create new register view',
    iconClass: 'register-view-icon toolbar',
};

export const RegisterSetVariableCommand: Command = {
    id: 'register-set-variable-value',
    label: 'Set Value',
};

export const ToggleDiffSelectWidgetVisibilityCommand: Command = {
    id: 'toggle-diff-select-visibility',
    iconClass: 'codicon codicon-git-compare',
};

