// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { ITableVirtualDelegate } from '@theia/monaco-editor-core/esm/vs/base/browser/ui/table/table';
import { BareFontInfo } from '@theia/monaco-editor-core/esm/vs/editor/common/config/fontInfo';
import { DisassembledInstructionEntry } from './disassembly-view-utilities';

// This file is adapted from https://github.com/microsoft/vscode/blob/c061ce5c24fc480342fbc5f23244289d633c56eb/src/vs/workbench/contrib/debug/browser/disassemblyView.ts

export class DisassemblyViewTableDelegate implements ITableVirtualDelegate<DisassembledInstructionEntry> {
    constructor(protected readonly fontInfoProvider: { fontInfo: BareFontInfo, isSourceCodeRender: boolean }) { }

    headerRowHeight = 0;

    getHeight(row: DisassembledInstructionEntry): number {
        if (this.fontInfoProvider.isSourceCodeRender && row.instruction.location?.path && row.instruction.line !== undefined) {
            if (row.instruction.endLine !== undefined) {
                return this.fontInfoProvider.fontInfo.lineHeight + (row.instruction.endLine - row.instruction.line + 2);
            } else {
                return this.fontInfoProvider.fontInfo.lineHeight * 2;
            }
        }

        return this.fontInfoProvider.fontInfo.lineHeight;
    }
}
