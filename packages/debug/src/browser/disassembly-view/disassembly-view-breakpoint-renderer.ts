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

import { append, $, addStandardDisposableListener } from '@theia/monaco-editor-core/esm/vs/base/browser/dom';
import { ITableRenderer } from '@theia/monaco-editor-core/esm/vs/base/browser/ui/table/table';
import { dispose } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';
import { BreakpointManager } from '../breakpoint/breakpoint-manager';
import { BreakpointColumnTemplateData, DisassembledInstructionEntry, DisassemblyViewRendererReference } from './disassembly-view-utilities';

// This file is adapted from https://github.com/microsoft/vscode/blob/c061ce5c24fc480342fbc5f23244289d633c56eb/src/vs/workbench/contrib/debug/browser/disassemblyView.ts

export class BreakpointRenderer implements ITableRenderer<DisassembledInstructionEntry, BreakpointColumnTemplateData> {

    static readonly TEMPLATE_ID = 'breakpoint';

    templateId: string = BreakpointRenderer.TEMPLATE_ID;

    protected readonly _breakpointIcon = 'codicon-debug-breakpoint';
    protected readonly _breakpointDisabledIcon = 'codicon-debug-breakpoint-disabled';
    protected readonly _breakpointHintIcon = 'codicon-debug-hint';
    protected readonly _debugStackframe = 'codicon-debug-stackframe';
    protected readonly _debugStackframeFocused = 'codicon-debug-stackframe-focused';

    constructor(
        protected readonly _disassemblyView: DisassemblyViewRendererReference,
        protected readonly _debugService: BreakpointManager,
    ) { }

    renderTemplate(container: HTMLElement): BreakpointColumnTemplateData {
        // align from the bottom so that it lines up with instruction when source code is present.
        container.style.alignSelf = 'flex-end';

        const icon = append(container, $('.disassembly-view'));
        icon.classList.add('codicon');
        icon.style.display = 'flex';
        icon.style.alignItems = 'center';
        icon.style.justifyContent = 'center';
        icon.style.height = this._disassemblyView.fontInfo.lineHeight + 'px';

        const currentElement: { element?: DisassembledInstructionEntry } = { element: undefined };

        const disposables = [
            this._disassemblyView.onDidChangeStackFrame(() => this.rerenderDebugStackframe(icon, currentElement.element)),
            addStandardDisposableListener(container, 'mouseover', () => {
                if (currentElement.element?.allowBreakpoint) {
                    icon.classList.add(this._breakpointHintIcon);
                }
            }),
            addStandardDisposableListener(container, 'mouseout', () => {
                if (currentElement.element?.allowBreakpoint) {
                    icon.classList.remove(this._breakpointHintIcon);
                }
            }),
            addStandardDisposableListener(container, 'click', () => {
                if (currentElement.element?.allowBreakpoint) {
                    // click show hint while waiting for BP to resolve.
                    icon.classList.add(this._breakpointHintIcon);
                    if (currentElement.element.isBreakpointSet) {
                        this._debugService.removeInstructionBreakpoint(currentElement.element.instruction.address);

                    } else if (currentElement.element.allowBreakpoint && !currentElement.element.isBreakpointSet) {
                        this._debugService.addInstructionBreakpoint(currentElement.element.instruction.address, 0);
                    }
                }
            })
        ];

        return { currentElement, icon, disposables };
    }

    renderElement(element: DisassembledInstructionEntry, index: number, templateData: BreakpointColumnTemplateData, height: number | undefined): void {
        templateData.currentElement.element = element;
        this.rerenderDebugStackframe(templateData.icon, element);
    }

    disposeTemplate(templateData: BreakpointColumnTemplateData): void {
        dispose(templateData.disposables);
        templateData.disposables = [];
    }

    protected rerenderDebugStackframe(icon: HTMLElement, element?: DisassembledInstructionEntry): void {
        if (element?.instruction.address === this._disassemblyView.focusedCurrentInstructionAddress) {
            icon.classList.add(this._debugStackframe);
        } else if (element?.instruction.address === this._disassemblyView.focusedInstructionAddress) {
            icon.classList.add(this._debugStackframeFocused);
        } else {
            icon.classList.remove(this._debugStackframe);
            icon.classList.remove(this._debugStackframeFocused);
        }

        icon.classList.remove(this._breakpointHintIcon);

        if (element?.isBreakpointSet) {
            if (element.isBreakpointEnabled) {
                icon.classList.add(this._breakpointIcon);
                icon.classList.remove(this._breakpointDisabledIcon);
            } else {
                icon.classList.remove(this._breakpointIcon);
                icon.classList.add(this._breakpointDisabledIcon);
            }
        } else {
            icon.classList.remove(this._breakpointIcon);
            icon.classList.remove(this._breakpointDisabledIcon);
        }
    }
}
