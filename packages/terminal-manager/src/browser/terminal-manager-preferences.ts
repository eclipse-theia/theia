// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import { nls, PreferenceProxy, PreferenceSchema, PreferenceScope } from '@theia/core';

export const TerminalManagerPreferenceSchema: PreferenceSchema = {
    properties: {
        'terminal.grouping.treeViewLocation': {
            'type': 'string',
            'enum': ['left', 'right'],
            'description': nls.localize('theia/terminalManager/treeViewLocation', 'The location of the terminal manager\'s tree view.'
                + ' Only applies when \'terminal.grouping.mode\' is set to \'tree\'.'),
            'default': 'left',
            'scope': PreferenceScope.Workspace,
        },
        'terminal.grouping.mode': {
            'type': 'string',
            'enum': ['tabbed', 'tree'],
            'description': nls.localize('theia/terminalManager/tabsDisplay',
                'Controls how terminals are displayed. \'tree\' shows multiple terminals in a single view with a tree view for management,'
                + '\'tabbed\' shows each terminal in its own view in a separate tab.'),
            'default': 'tabbed',
            'scope': PreferenceScope.Workspace,
        },
    },
};

export type TerminalManagerTreeViewLocation = 'left' | 'right';
export type TerminalGroupingMode = 'tabbed' | 'tree';

export interface TerminalManagerConfiguration {
    'terminal.grouping.treeViewLocation': TerminalManagerTreeViewLocation;
    'terminal.grouping.mode': TerminalGroupingMode;
}

export const TerminalManagerPreferences = Symbol('TerminalManagerPreferences');
export const TerminalManagerPreferenceContribution = Symbol('TerminalManagerPreferenceContribution');
export type TerminalManagerPreferences = PreferenceProxy<TerminalManagerConfiguration>;

