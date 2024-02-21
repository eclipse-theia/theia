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

import { open, OpenerService } from '@theia/core/lib/browser';
import { URI as TheiaURI } from '@theia/core/lib/common/uri';
import { EditorOpenerOptions } from '@theia/editor/lib/browser';
import { IDisposable, Uri as URI } from '@theia/monaco-editor-core';
import { $, addStandardDisposableListener, append } from '@theia/monaco-editor-core/esm/vs/base/browser/dom';
import { ITableRenderer } from '@theia/monaco-editor-core/esm/vs/base/browser/ui/table/table';
import { Color } from '@theia/monaco-editor-core/esm/vs/base/common/color';
import { Disposable, dispose } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';
import { isAbsolute } from '@theia/monaco-editor-core/esm/vs/base/common/path';
import { Constants } from '@theia/monaco-editor-core/esm/vs/base/common/uint';
import { applyFontInfo } from '@theia/monaco-editor-core/esm/vs/editor/browser/config/domFontInfo';
import { StringBuilder } from '@theia/monaco-editor-core/esm/vs/editor/common/core/stringBuilder';
import { ITextModel } from '@theia/monaco-editor-core/esm/vs/editor/common/model';
import { ITextModelService } from '@theia/monaco-editor-core/esm/vs/editor/common/services/resolverService';
import { IThemeService } from '@theia/monaco-editor-core/esm/vs/platform/theme/common/themeService';
import { DebugProtocol } from '@vscode/debugprotocol';
import { DebugSource } from '../model/debug-source';
import { DisassembledInstructionEntry, DisassemblyViewRendererReference, InstructionColumnTemplateData } from './disassembly-view-utilities';

// This file is adapted from https://github.com/microsoft/vscode/blob/c061ce5c24fc480342fbc5f23244289d633c56eb/src/vs/workbench/contrib/debug/browser/disassemblyView.ts

const topStackFrameColor = 'editor.stackFrameHighlightBackground';
const focusedStackFrameColor = 'editor.focusedStackFrameHighlightBackground';

export class InstructionRenderer extends Disposable implements ITableRenderer<DisassembledInstructionEntry, InstructionColumnTemplateData> {

    static readonly TEMPLATE_ID = 'instruction';

    protected static readonly INSTRUCTION_ADDR_MIN_LENGTH = 25;
    protected static readonly INSTRUCTION_BYTES_MIN_LENGTH = 30;

    templateId: string = InstructionRenderer.TEMPLATE_ID;

    protected _topStackFrameColor: Color | undefined;
    protected _focusedStackFrameColor: Color | undefined;

    constructor(
        protected readonly _disassemblyView: DisassemblyViewRendererReference,
        protected readonly openerService: OpenerService,
        protected readonly uriService: { asCanonicalUri(uri: URI): URI },
        @IThemeService themeService: IThemeService,
        @ITextModelService protected readonly textModelService: ITextModelService,
    ) {
        super();

        this._topStackFrameColor = themeService.getColorTheme().getColor(topStackFrameColor);
        this._focusedStackFrameColor = themeService.getColorTheme().getColor(focusedStackFrameColor);

        this._register(themeService.onDidColorThemeChange(e => {
            this._topStackFrameColor = e.getColor(topStackFrameColor);
            this._focusedStackFrameColor = e.getColor(focusedStackFrameColor);
        }));
    }

    renderTemplate(container: HTMLElement): InstructionColumnTemplateData {
        const sourcecode = append(container, $('.sourcecode'));
        const instruction = append(container, $('.instruction'));
        this.applyFontInfo(sourcecode);
        this.applyFontInfo(instruction);
        const currentElement: { element?: DisassembledInstructionEntry } = { element: undefined };
        const cellDisposable: IDisposable[] = [];

        const disposables = [
            this._disassemblyView.onDidChangeStackFrame(() => this.rerenderBackground(instruction, sourcecode, currentElement.element)),
            addStandardDisposableListener(sourcecode, 'dblclick', () => this.openSourceCode(currentElement.element?.instruction!)),
        ];

        return { currentElement, instruction, sourcecode, cellDisposable, disposables };
    }

    renderElement(element: DisassembledInstructionEntry, index: number, templateData: InstructionColumnTemplateData, height: number | undefined): void {
        this.renderElementInner(element, index, templateData, height);
    }

    protected async renderElementInner(element: DisassembledInstructionEntry, index: number, column: InstructionColumnTemplateData, height: number | undefined): Promise<void> {
        column.currentElement.element = element;
        const instruction = element.instruction;
        column.sourcecode.innerText = '';
        const sb = new StringBuilder(1000);

        if (this._disassemblyView.isSourceCodeRender && instruction.location?.path && instruction.line) {
            const sourceURI = this.getUriFromSource(instruction);

            if (sourceURI) {
                let textModel: ITextModel | undefined = undefined;
                const sourceSB = new StringBuilder(10000);
                const ref = await this.textModelService.createModelReference(sourceURI);
                textModel = ref.object.textEditorModel;
                column.cellDisposable.push(ref);

                // templateData could have moved on during async.  Double check if it is still the same source.
                if (textModel && column.currentElement.element === element) {
                    let lineNumber = instruction.line;

                    while (lineNumber && lineNumber >= 1 && lineNumber <= textModel.getLineCount()) {
                        const lineContent = textModel.getLineContent(lineNumber);
                        sourceSB.appendString(`  ${lineNumber}: `);
                        sourceSB.appendString(lineContent + '\n');

                        if (instruction.endLine && lineNumber < instruction.endLine) {
                            lineNumber++;
                            continue;
                        }

                        break;
                    }

                    column.sourcecode.innerText = sourceSB.build();
                }
            }
        }

        let spacesToAppend = 10;

        if (instruction.address !== '-1') {
            sb.appendString(instruction.address);
            if (instruction.address.length < InstructionRenderer.INSTRUCTION_ADDR_MIN_LENGTH) {
                spacesToAppend = InstructionRenderer.INSTRUCTION_ADDR_MIN_LENGTH - instruction.address.length;
            }
            for (let i = 0; i < spacesToAppend; i++) {
                sb.appendString(' ');
            }
        }

        if (instruction.instructionBytes) {
            sb.appendString(instruction.instructionBytes);
            spacesToAppend = 10;
            if (instruction.instructionBytes.length < InstructionRenderer.INSTRUCTION_BYTES_MIN_LENGTH) {
                spacesToAppend = InstructionRenderer.INSTRUCTION_BYTES_MIN_LENGTH - instruction.instructionBytes.length;
            }
            for (let i = 0; i < spacesToAppend; i++) {
                sb.appendString(' ');
            }
        }

        sb.appendString(instruction.instruction);
        column.instruction.innerText = sb.build();

        this.rerenderBackground(column.instruction, column.sourcecode, element);
    }

    disposeElement(element: DisassembledInstructionEntry, index: number, templateData: InstructionColumnTemplateData, height: number | undefined): void {
        dispose(templateData.cellDisposable);
        templateData.cellDisposable = [];
    }

    disposeTemplate(templateData: InstructionColumnTemplateData): void {
        dispose(templateData.disposables);
        templateData.disposables = [];
    }

    protected rerenderBackground(instruction: HTMLElement, sourceCode: HTMLElement, element?: DisassembledInstructionEntry): void {
        if (element && this._disassemblyView.currentInstructionAddresses.includes(element.instruction.address)) {
            instruction.style.background = this._topStackFrameColor?.toString() || 'transparent';
        } else if (element?.instruction.address === this._disassemblyView.focusedInstructionAddress) {
            instruction.style.background = this._focusedStackFrameColor?.toString() || 'transparent';
        } else {
            instruction.style.background = 'transparent';
        }
    }

    protected openSourceCode(instruction: DebugProtocol.DisassembledInstruction | undefined): void {
        if (instruction) {
            const sourceURI = this.getUriFromSource(instruction);
            const selection: EditorOpenerOptions['selection'] = instruction.endLine ? {
                start: { line: instruction.line!, character: instruction.column ?? 0 },
                end: { line: instruction.endLine, character: instruction.endColumn ?? Constants.MAX_SAFE_SMALL_INTEGER }
            } : {
                start: { line: instruction.line!, character: instruction.column ?? 0 },
                end: { line: instruction.line, character: instruction.endColumn ?? Constants.MAX_SAFE_SMALL_INTEGER }
            };

            const openerOptions: EditorOpenerOptions = {
                selection,
                mode: 'activate',
                widgetOptions: { area: 'main' }
            };
            open(this.openerService, new TheiaURI(sourceURI.toString()), openerOptions);
        }
    }

    protected getUriFromSource(instruction: DebugProtocol.DisassembledInstruction): URI {
        // Try to resolve path before consulting the debugSession.
        const path = instruction.location!.path;
        if (path && isUri(path)) { // path looks like a uri
            return this.uriService.asCanonicalUri(URI.parse(path));
        }
        // assume a filesystem path
        if (path && isAbsolute(path)) {
            return this.uriService.asCanonicalUri(URI.file(path));
        }

        return getUriFromSource(instruction.location!, instruction.location!.path, this._disassemblyView.debugSession!.id, this.uriService);
    }

    protected applyFontInfo(element: HTMLElement): void {
        applyFontInfo(element, this._disassemblyView.fontInfo);
        element.style.whiteSpace = 'pre';
    }
}

export function getUriFromSource(raw: DebugProtocol.Source, path: string | undefined, sessionId: string, uriIdentityService: { asCanonicalUri(uri: URI): URI }): URI {
    if (typeof raw.sourceReference === 'number' && raw.sourceReference > 0) {
        return URI.from({
            scheme: DebugSource.SCHEME,
            path,
            query: `session=${sessionId}&ref=${raw.sourceReference}`
        });
    }

    if (path && isUri(path)) { // path looks like a uri
        return uriIdentityService.asCanonicalUri(URI.parse(path));
    }
    // assume a filesystem path
    if (path && isAbsolute(path)) {
        return uriIdentityService.asCanonicalUri(URI.file(path));
    }
    // path is relative: since VS Code cannot deal with this by itself
    // create a debug url that will result in a DAP 'source' request when the url is resolved.
    return uriIdentityService.asCanonicalUri(URI.from({
        scheme: DebugSource.SCHEME,
        path,
        query: `session=${sessionId}`
    }));
}

function isUri(candidate: string | undefined): boolean {
    return Boolean(candidate && candidate.match(DebugSource.SCHEME_PATTERN));
}
