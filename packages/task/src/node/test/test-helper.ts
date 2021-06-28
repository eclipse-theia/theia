/********************************************************************************
 * Copyright (c) 2021 SAP SE or an SAP affiliate company and others.
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

import { PanelKind, RevealKind, TaskScope } from '../../common';

const FOOBAR_TASK = {
    TYPE: 'foobar_type',
    SRC: 'foobar_src'
};

const defaultPresentation = {
    clear: false,
    echo: true,
    focus: false,
    panel: PanelKind.Shared,
    reveal: RevealKind.Always,
    showReuseMessage: true,
};

export const foobarTaskFixture = {
    def: {
        taskType: FOOBAR_TASK.TYPE,
        source: FOOBAR_TASK.SRC,
        required: ['strArg'],
        properties: {
            required: ['strArg'],
            all: ['strArg', 'arrArgs'],
            schema: {
                type: FOOBAR_TASK.TYPE,
                required: ['strArg'],
                properties: {
                    strArg: {},
                    arrArgs: {}
                }
            }
        }
    },
    conf: (
        executionId = 'foobar',
        type = FOOBAR_TASK.TYPE,
        _source = FOOBAR_TASK.SRC,
        arrArgs: unknown[] = [],
        strArg = '',
        label = 'foobar',
        presentation = defaultPresentation,
        problemMatcher = undefined,
        taskType = 'customExecution',
        _scope = TaskScope.Workspace,
    ) => ({
        executionId, arrArgs, strArg, label, presentation,
        problemMatcher, taskType, type, _scope, _source,
    })
};
