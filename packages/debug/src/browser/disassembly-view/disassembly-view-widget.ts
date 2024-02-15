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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { BaseWidget, LabelProvider, Message, OpenerService, Widget } from '@theia/core/lib/browser';
import { ArrayUtils } from '@theia/core/lib/common/types';
import { DebugProtocol } from '@vscode/debugprotocol';
import { InstructionBreakpoint } from '../breakpoint/breakpoint-marker';
import { BreakpointManager } from '../breakpoint/breakpoint-manager';
import { DebugSessionManager } from '../debug-session-manager';
import { Emitter, IDisposable, IRange, Range, Uri } from '@theia/monaco-editor-core';
import { nls } from '@theia/core';
import { BareFontInfo } from '@theia/monaco-editor-core/esm/vs/editor/common/config/fontInfo';
import { WorkbenchTable } from '@theia/monaco-editor-core/esm/vs/platform/list/browser/listService';
import { DebugState, DebugSession } from '../debug-session';
import { EditorPreferences } from '@theia/editor/lib/browser';
import { PixelRatio } from '@theia/monaco-editor-core/esm/vs/base/browser/browser';
import { DebugPreferences } from '../debug-preferences';
import { DebugThread } from '../model/debug-thread';
import { Event } from '@theia/monaco-editor-core/esm/vs/base/common/event';
import { DisassembledInstructionEntry } from './disassembly-view-utilities';
import { DisassemblyViewTableDelegate } from './disassembly-view-table-delegate';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { InstructionRenderer } from './disassembly-view-instruction-renderer';
import { IInstantiationService } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation';
import { BreakpointRenderer } from './disassembly-view-breakpoint-renderer';
import { AccessibilityProvider } from './disassembly-view-accessibility-provider';
import { editorBackground } from '@theia/monaco-editor-core/esm/vs/platform/theme/common/colorRegistry';
import { Dimension } from '@theia/monaco-editor-core/esm/vs/base/browser/dom';
import { URI } from '@theia/core/lib/common/uri';

// This file is adapted from https://github.com/microsoft/vscode/blob/c061ce5c24fc480342fbc5f23244289d633c56eb/src/vs/workbench/contrib/debug/browser/disassemblyView.ts

// Special entry as a placeholder when disassembly is not available
const disassemblyNotAvailable: DisassembledInstructionEntry = {
    allowBreakpoint: false,
    isBreakpointSet: false,
    isBreakpointEnabled: false,
    instruction: {
        address: '-1',
        instruction: nls.localizeByDefault('Disassembly not available.')
    },
    instructionAddress: BigInt(-1)
} as const;

@injectable()
export class DisassemblyViewWidget extends BaseWidget {
    static readonly ID = 'disassembly-view-widget';
    protected static readonly NUM_INSTRUCTIONS_TO_LOAD = 50;
    protected readonly iconReferenceUri = new URI().withScheme('file').withPath('disassembly-view.disassembly-view');

    @inject(BreakpointManager) protected readonly breakpointManager: BreakpointManager;
    @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager;
    @inject(EditorPreferences) protected readonly editorPreferences: EditorPreferences;
    @inject(DebugPreferences) protected readonly debugPreferences: DebugPreferences;
    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;

    protected _fontInfo: BareFontInfo;
    protected _disassembledInstructions: WorkbenchTable<DisassembledInstructionEntry> | undefined = undefined;
    protected _onDidChangeStackFrame = new Emitter<void>();
    protected _previousDebuggingState: DebugState;
    protected _instructionBpList: readonly InstructionBreakpoint[] = [];
    protected _enableSourceCodeRender: boolean = true;
    protected _loadingLock: boolean = false;

    @postConstruct()
    protected init(): void {
        this.id = DisassemblyViewWidget.ID;
        this.addClass(DisassemblyViewWidget.ID);
        this.title.closable = true;
        this.title.label = nls.localizeByDefault('Disassembly');
        const updateIcon = () => this.title.iconClass = this.labelProvider.getIcon(this.iconReferenceUri) + ' file-icon';
        updateIcon();
        this.toDispose.push(this.labelProvider.onDidChange(updateIcon));
        this.node.tabIndex = -1;
        this.node.style.outline = 'none';
        this._previousDebuggingState = this.debugSessionManager.currentSession?.state ?? DebugState.Inactive;
        this._fontInfo = BareFontInfo.createFromRawSettings(this.toFontInfo(), PixelRatio.value);
        this.editorPreferences.onPreferenceChanged(() => this._fontInfo = BareFontInfo.createFromRawSettings(this.toFontInfo(), PixelRatio.value));
        this.debugPreferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'debug.disassemblyView.showSourceCode' && e.newValue !== this._enableSourceCodeRender) {
                this._enableSourceCodeRender = e.newValue;
                this.reloadDisassembly(undefined);
            } else {
                this._disassembledInstructions?.rerender();
            }
        });
        this.createPane();
    }

    get fontInfo(): BareFontInfo { return this._fontInfo; }

    get currentInstructionAddresses(): Array<string | undefined> {
        return this.debugSessionManager.sessions
            .map(session => session.getThreads(() => true))
            .reduce<DebugThread[]>((prev, curr) => prev.concat(Array.from(curr)), [])
            .map(thread => thread.topFrame)
            .map(frame => frame?.raw.instructionPointerReference);
    }

    get focusedCurrentInstructionAddress(): string | undefined {
        return this.debugSessionManager.currentFrame?.thread.topFrame?.raw.instructionPointerReference;
    }

    get isSourceCodeRender(): boolean { return this._enableSourceCodeRender; }

    get debugSession(): DebugSession | undefined { return this.debugSessionManager.currentSession; }

    get focusedInstructionAddress(): string | undefined {
        return this.debugSessionManager.currentFrame?.raw.instructionPointerReference;
    }

    get onDidChangeStackFrame(): Event<void> { return this._onDidChangeStackFrame.event; }

    protected createPane(): void {
        this._enableSourceCodeRender = this.debugPreferences['debug.disassemblyView.showSourceCode'];
        const monacoInstantiationService = StandaloneServices.get(IInstantiationService);
        const tableDelegate = new DisassemblyViewTableDelegate(this);
        const instructionRenderer = monacoInstantiationService.createInstance(InstructionRenderer, this, this.openerService, { asCanonicalUri(thing: Uri): Uri { return thing; } });
        this.toDispose.push(instructionRenderer);
        this.getTable(monacoInstantiationService, tableDelegate, instructionRenderer);
        this.reloadDisassembly();
        this._register(this._disassembledInstructions!.onDidScroll(e => {
            if (this._loadingLock) {
                return;
            }

            if (e.oldScrollTop > e.scrollTop && e.scrollTop < e.height) {
                this._loadingLock = true;
                const topElement = Math.floor(e.scrollTop / this.fontInfo.lineHeight) + DisassemblyViewWidget.NUM_INSTRUCTIONS_TO_LOAD;
                this.scrollUp_LoadDisassembledInstructions(DisassemblyViewWidget.NUM_INSTRUCTIONS_TO_LOAD).then(success => {
                    if (success) {
                        this._disassembledInstructions!.reveal(topElement, 0);
                    }
                    this._loadingLock = false;
                });
            } else if (e.oldScrollTop < e.scrollTop && e.scrollTop + e.height > e.scrollHeight - e.height) {
                this._loadingLock = true;
                this.scrollDown_LoadDisassembledInstructions(DisassemblyViewWidget.NUM_INSTRUCTIONS_TO_LOAD).then(() => { this._loadingLock = false; });
            }
        }));
        this._register(this.debugSessionManager.onDidFocusStackFrame(() => {
            if (this._disassembledInstructions) {
                this.goToAddress();
                this._onDidChangeStackFrame.fire();
            }
        }));
        this._register(this.breakpointManager.onDidChangeInstructionBreakpoints(bpEvent => {
            if (bpEvent && this._disassembledInstructions) {
                // draw viewable BP
                let changed = false;
                bpEvent.added?.forEach(bp => {
                    if (InstructionBreakpoint.is(bp)) {
                        const index = this.getIndexFromAddress(bp.instructionReference);
                        if (index >= 0) {
                            this._disassembledInstructions!.row(index).isBreakpointSet = true;
                            this._disassembledInstructions!.row(index).isBreakpointEnabled = bp.enabled;
                            changed = true;
                        }
                    }
                });

                bpEvent.removed?.forEach(bp => {
                    if (InstructionBreakpoint.is(bp)) {
                        const index = this.getIndexFromAddress(bp.instructionReference);
                        if (index >= 0) {
                            this._disassembledInstructions!.row(index).isBreakpointSet = false;
                            changed = true;
                        }
                    }
                });

                bpEvent.changed?.forEach(bp => {
                    if (InstructionBreakpoint.is(bp)) {
                        const index = this.getIndexFromAddress(bp.instructionReference);
                        if (index >= 0) {
                            if (this._disassembledInstructions!.row(index).isBreakpointEnabled !== bp.enabled) {
                                this._disassembledInstructions!.row(index).isBreakpointEnabled = bp.enabled;
                                changed = true;
                            }
                        }
                    }
                });

                // get an updated list so that items beyond the current range would render when reached.
                this._instructionBpList = this.breakpointManager.getInstructionBreakpoints();

                if (changed) {
                    this._onDidChangeStackFrame.fire();
                }
            }
        }));

        // This would like to be more specific: onDidChangeState
        this._register(this.debugSessionManager.onDidChange(() => {
            const state = this.debugSession?.state;

            if ((state === DebugState.Running || state === DebugState.Stopped) &&
                (this._previousDebuggingState !== DebugState.Running && this._previousDebuggingState !== DebugState.Stopped)) {
                // Just started debugging, clear the view
                this._disassembledInstructions?.splice(0, this._disassembledInstructions.length, [disassemblyNotAvailable]);
                this._enableSourceCodeRender = this.debugPreferences['debug.disassemblyView.showSourceCode'];
            }
            if (state !== undefined && state !== this._previousDebuggingState) {
                this._previousDebuggingState = state;
            }
        }));
    }

    protected getTable(
        monacoInstantiationService: IInstantiationService,
        tableDelegate: DisassemblyViewTableDelegate,
        instructionRenderer: InstructionRenderer
    ): WorkbenchTable<DisassembledInstructionEntry> {
        return this._disassembledInstructions = this._register(monacoInstantiationService.createInstance(WorkbenchTable,
            'DisassemblyView', this.node, tableDelegate,
            [
                {
                    label: '',
                    tooltip: '',
                    weight: 0,
                    minimumWidth: this.fontInfo.lineHeight,
                    maximumWidth: this.fontInfo.lineHeight,
                    templateId: BreakpointRenderer.TEMPLATE_ID,
                    project(row: DisassembledInstructionEntry): DisassembledInstructionEntry { return row; }
                },
                {
                    label: nls.localizeByDefault('instructions'),
                    tooltip: '',
                    weight: 0.3,
                    templateId: InstructionRenderer.TEMPLATE_ID,
                    project(row: DisassembledInstructionEntry): DisassembledInstructionEntry { return row; }
                },
            ],
            [
                new BreakpointRenderer(this, this.breakpointManager),
                instructionRenderer,
            ],
            {
                identityProvider: { getId: (e: DisassembledInstructionEntry) => e.instruction.address },
                horizontalScrolling: false,
                overrideStyles: {
                    listBackground: editorBackground
                },
                multipleSelectionSupport: false,
                setRowLineHeight: false,
                openOnSingleClick: false,
                accessibilityProvider: new AccessibilityProvider(),
                mouseSupport: false
            }
        )) as WorkbenchTable<DisassembledInstructionEntry>;
    }

    adjustLayout(dimension: Dimension): void {
        if (this._disassembledInstructions) {
            this._disassembledInstructions.layout(dimension.height);
        }
    }

    goToAddress(address?: string, focus?: boolean): void {
        if (!this._disassembledInstructions) {
            return;
        }

        if (!address) {
            address = this.focusedInstructionAddress;
        }
        if (!address) {
            return;
        }

        const index = this.getIndexFromAddress(address);
        if (index >= 0) {
            this._disassembledInstructions.reveal(index);

            if (focus) {
                this._disassembledInstructions.domFocus();
                this._disassembledInstructions.setFocus([index]);
            }
        } else if (this.debugSessionManager.state === DebugState.Stopped) {
            // Address is not provided or not in the table currently, clear the table
            // and reload if we are in the state where we can load disassembly.
            this.reloadDisassembly(address);
        }
    }

    protected async scrollUp_LoadDisassembledInstructions(instructionCount: number): Promise<boolean> {
        if (this._disassembledInstructions && this._disassembledInstructions.length > 0) {
            const address: string | undefined = this._disassembledInstructions?.row(0).instruction.address;
            return this.loadDisassembledInstructions(address, -instructionCount, instructionCount);
        }

        return false;
    }

    protected async scrollDown_LoadDisassembledInstructions(instructionCount: number): Promise<boolean> {
        if (this._disassembledInstructions && this._disassembledInstructions.length > 0) {
            const address: string | undefined = this._disassembledInstructions?.row(this._disassembledInstructions?.length - 1).instruction.address;
            return this.loadDisassembledInstructions(address, 1, instructionCount);
        }

        return false;
    }

    protected async loadDisassembledInstructions(memoryReference: string | undefined, instructionOffset: number, instructionCount: number): Promise<boolean> {
        // if address is null, then use current stack frame.
        if (!memoryReference || memoryReference === '-1') {
            memoryReference = this.focusedInstructionAddress;
        }
        if (!memoryReference) {
            return false;
        }

        const session = this.debugSession;
        const resultEntries = (await session?.sendRequest('disassemble', {
            instructionCount,
            memoryReference,
            instructionOffset,
            offset: 0,
            resolveSymbols: true,
        }))?.body?.instructions;
        if (session && resultEntries && this._disassembledInstructions) {
            const newEntries: DisassembledInstructionEntry[] = [];
            const allowBreakpoint = Boolean(session.capabilities.supportsInstructionBreakpoints);

            let lastLocation: DebugProtocol.Source | undefined;
            let lastLine: IRange | undefined;
            for (let i = 0; i < resultEntries.length; i++) {
                const found = this._instructionBpList.find(p => p.instructionReference === resultEntries[i].address);
                const instruction = resultEntries[i];

                // Forward fill the missing location as detailed in the DAP spec.
                if (instruction.location) {
                    lastLocation = instruction.location;
                    lastLine = undefined;
                }

                if (instruction.line) {
                    const currentLine: IRange = {
                        startLineNumber: instruction.line,
                        startColumn: instruction.column ?? 0,
                        endLineNumber: instruction.endLine ?? instruction.line!,
                        endColumn: instruction.endColumn ?? 0,
                    };

                    // Add location only to the first unique range. This will give the appearance of grouping of instructions.
                    if (!Range.equalsRange(currentLine, lastLine ?? null)) { // eslint-disable-line no-null/no-null
                        lastLine = currentLine;
                        instruction.location = lastLocation;
                    }
                }

                newEntries.push({ allowBreakpoint, isBreakpointSet: found !== undefined, isBreakpointEnabled: !!found?.enabled, instruction: instruction });
            }

            const specialEntriesToRemove = this._disassembledInstructions.length === 1 ? 1 : 0;

            // request is either at the start or end
            if (instructionOffset >= 0) {
                this._disassembledInstructions.splice(this._disassembledInstructions.length, specialEntriesToRemove, newEntries);
            } else {
                this._disassembledInstructions.splice(0, specialEntriesToRemove, newEntries);
            }

            return true;
        }

        return false;
    }

    protected getIndexFromAddress(instructionAddress: string): number {
        const disassembledInstructions = this._disassembledInstructions;
        if (disassembledInstructions && disassembledInstructions.length > 0) {
            const address = BigInt(instructionAddress);
            if (address) {
                return ArrayUtils.binarySearch2(disassembledInstructions.length, index => {
                    const row = disassembledInstructions.row(index);

                    this.ensureAddressParsed(row);
                    if (row.instructionAddress! > address) {
                        return 1;
                    } else if (row.instructionAddress! < address) {
                        return -1;
                    } else {
                        return 0;
                    }
                });
            }
        }

        return -1;
    }

    protected ensureAddressParsed(entry: DisassembledInstructionEntry): void {
        if (entry.instructionAddress !== undefined) {
            return;
        } else {
            entry.instructionAddress = BigInt(entry.instruction.address);
        }
    }

    /**
     * Clears the table and reload instructions near the target address
     */
    protected reloadDisassembly(targetAddress?: string): void {
        if (this._disassembledInstructions) {
            this._loadingLock = true; // stop scrolling during the load.
            this._disassembledInstructions.splice(0, this._disassembledInstructions.length, [disassemblyNotAvailable]);
            this._instructionBpList = this.breakpointManager.getInstructionBreakpoints();
            this.loadDisassembledInstructions(targetAddress, -DisassemblyViewWidget.NUM_INSTRUCTIONS_TO_LOAD * 4, DisassemblyViewWidget.NUM_INSTRUCTIONS_TO_LOAD * 8).then(() => {
                // on load, set the target instruction in the middle of the page.
                if (this._disassembledInstructions!.length > 0) {
                    const targetIndex = Math.floor(this._disassembledInstructions!.length / 2);
                    this._disassembledInstructions!.reveal(targetIndex, 0.5);

                    // Always focus the target address on reload, or arrow key navigation would look terrible
                    this._disassembledInstructions!.domFocus();
                    this._disassembledInstructions!.setFocus([targetIndex]);
                }
                this._loadingLock = false;
            });
        }
    }

    protected override onResize(msg: Widget.ResizeMessage): void {
        this.adjustLayout(new Dimension(msg.width, msg.height));
    }

    protected override onActivateRequest(msg: Message): void {
        this.node.focus();
        super.onActivateRequest(msg);
    }

    protected toFontInfo(): Parameters<typeof BareFontInfo.createFromRawSettings>[0] {
        return {
            fontFamily: this.editorPreferences['editor.fontFamily'],
            fontWeight: String(this.editorPreferences['editor.fontWeight']),
            fontSize: this.editorPreferences['editor.fontSize'],
            fontLigatures: this.editorPreferences['editor.fontLigatures'],
            lineHeight: this.editorPreferences['editor.lineHeight'],
            letterSpacing: this.editorPreferences['editor.letterSpacing'],
        };
    }

    protected _register<T extends IDisposable>(disposable: T): T {
        this.toDispose.push(disposable);
        return disposable;
    }
}
