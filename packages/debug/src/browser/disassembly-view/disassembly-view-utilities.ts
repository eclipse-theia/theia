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

import { IDisposable, IEvent } from '@theia/monaco-editor-core';
import { BareFontInfo } from '@theia/monaco-editor-core/esm/vs/editor/common/config/fontInfo';
import { DebugProtocol } from '@vscode/debugprotocol';

export interface DisassemblyViewRendererReference {
    onDidChangeStackFrame: IEvent<void>;
    isSourceCodeRender: boolean;
    currentInstructionAddresses: Array<string | undefined>;
    focusedInstructionAddress: string | undefined;
    focusedCurrentInstructionAddress: string | undefined;
    debugSession: { id: string } | undefined;
    fontInfo: BareFontInfo;
}

// The rest of the file is adapted from https://github.com/microsoft/vscode/blob/c061ce5c24fc480342fbc5f23244289d633c56eb/src/vs/workbench/contrib/debug/browser/disassemblyView.ts
export interface DisassembledInstructionEntry {
    allowBreakpoint: boolean;
    isBreakpointSet: boolean;
    isBreakpointEnabled: boolean;
    instruction: DebugProtocol.DisassembledInstruction;
    instructionAddress?: bigint;
}

export interface InstructionColumnTemplateData {
    currentElement: { element?: DisassembledInstructionEntry };
    // TODO: hover widget?
    instruction: HTMLElement;
    sourcecode: HTMLElement;
    // disposed when cell is closed.
    cellDisposable: IDisposable[];
    // disposed when template is closed.
    disposables: IDisposable[];
}

export interface BreakpointColumnTemplateData {
    currentElement: { element?: DisassembledInstructionEntry };
    icon: HTMLElement;
    disposables: IDisposable[];
}
