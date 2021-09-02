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

import { MemoryTable } from '../memory-widget/memory-table-widget';
import { VariableDecoration } from '../utils/memory-widget-variable-utils';

export enum DiffLabels {
    Before = 'before',
    After = 'after'
}

export interface RowData {
    groups: React.ReactNodeArray;
    variables: VariableDecoration[];
    ascii: string;
}

export interface DiffRowOptions {
    beforeAddress: string;
    afterAddress: string;
    before: RowData;
    after: RowData;
    doShowDivider: boolean;
    isModified: boolean;
}

export interface DiffExtraColumnOptions extends Pick<MemoryTable.RowOptions, 'ascii' | 'variables'> {
    afterAscii: string;
    afterVariables: VariableDecoration[];
    variables: VariableDecoration[];
    ascii: string;
}
