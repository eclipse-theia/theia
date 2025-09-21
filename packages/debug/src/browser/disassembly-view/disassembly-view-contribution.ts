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

import { inject, injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';
import { AbstractViewContribution, bindViewContribution, WidgetFactory } from '@theia/core/lib/browser';
import { DisassemblyViewWidget } from './disassembly-view-widget';
import { Command, CommandRegistry, MenuModelRegistry, nls } from '@theia/core';
import { DebugService } from '../../common/debug-service';
import { EditorManager, EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { DebugSessionManager } from '../debug-session-manager';
import { DebugStackFrame } from '../model/debug-stack-frame';
import { DebugSession, DebugState } from '../debug-session';
import { DebugStackFramesWidget } from '../view/debug-stack-frames-widget';

export const OPEN_DISASSEMBLY_VIEW_COMMAND: Command = {
    id: 'open-disassembly-view',
    label: nls.localizeByDefault('Open Disassembly View')
};

export const LANGUAGE_SUPPORTS_DISASSEMBLE_REQUEST = 'languageSupportsDisassembleRequest';
export const FOCUSED_STACK_FRAME_HAS_INSTRUCTION_REFERENCE = 'focusedStackFrameHasInstructionReference';
export const DISASSEMBLE_REQUEST_SUPPORTED = 'disassembleRequestSupported';
export const DISASSEMBLY_VIEW_FOCUS = 'disassemblyViewFocus';

@injectable()
export class DisassemblyViewContribution extends AbstractViewContribution<DisassemblyViewWidget> {
    @inject(DebugService) protected readonly debugService: DebugService;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(ContextKeyService) protected readonly contextKeyService: ContextKeyService;
    @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager;

    constructor() {
        super({
            widgetId: DisassemblyViewWidget.ID,
            widgetName: nls.localizeByDefault('Disassembly View'),
            defaultWidgetOptions: { area: 'main' }
        });
    }

    @postConstruct()
    protected init(): void {
        let activeEditorChangeCancellation = { cancelled: false };
        const updateLanguageSupportsDisassemblyKey = async () => {
            const editor = this.editorManager.currentEditor;
            activeEditorChangeCancellation.cancelled = true;
            const localCancellation = activeEditorChangeCancellation = { cancelled: false };

            const language = editor?.editor.document.languageId;
            const debuggersForLanguage = language && await this.debugService.getDebuggersForLanguage(language);
            if (!localCancellation.cancelled) {
                this.contextKeyService.setContext(LANGUAGE_SUPPORTS_DISASSEMBLE_REQUEST, Boolean(debuggersForLanguage?.length));
            }
        };
        this.editorManager.onCurrentEditorChanged(updateLanguageSupportsDisassemblyKey);
        this.debugService.onDidChangeDebuggers?.(updateLanguageSupportsDisassemblyKey);
        let lastSession: DebugSession | undefined;
        let lastFrame: DebugStackFrame | undefined;
        this.debugSessionManager.onDidChange(() => {
            const { currentFrame, currentSession } = this.debugSessionManager;
            if (currentFrame !== lastFrame) {
                lastFrame = currentFrame;
                this.contextKeyService.setContext(FOCUSED_STACK_FRAME_HAS_INSTRUCTION_REFERENCE, Boolean(currentFrame?.raw.instructionPointerReference));
            }
            if (currentSession !== lastSession) {
                lastSession = currentSession;
                this.contextKeyService.setContext(DISASSEMBLE_REQUEST_SUPPORTED, Boolean(currentSession?.capabilities.supportsDisassembleRequest));
            }
        });
        this.shell.onDidChangeCurrentWidget(widget => {
            this.contextKeyService.setContext(DISASSEMBLY_VIEW_FOCUS, widget instanceof DisassemblyViewWidget);
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(OPEN_DISASSEMBLY_VIEW_COMMAND, {
            isEnabled: () => this.debugSessionManager.inDebugMode
                && this.debugSessionManager.state === DebugState.Stopped
                && this.contextKeyService.match('focusedStackFrameHasInstructionReference'),
            execute: () => this.openView({ activate: true }),
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(DebugStackFramesWidget.CONTEXT_MENU,
            { commandId: OPEN_DISASSEMBLY_VIEW_COMMAND.id, label: OPEN_DISASSEMBLY_VIEW_COMMAND.label });
        menus.registerMenuAction([...EDITOR_CONTEXT_MENU, 'a_debug'],
            { commandId: OPEN_DISASSEMBLY_VIEW_COMMAND.id, label: OPEN_DISASSEMBLY_VIEW_COMMAND.label, when: LANGUAGE_SUPPORTS_DISASSEMBLE_REQUEST });
    }
}

export function bindDisassemblyView(bind: interfaces.Bind): void {
    bind(DisassemblyViewWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({ id: DisassemblyViewWidget.ID, createWidget: () => container.get(DisassemblyViewWidget) }));
    bindViewContribution(bind, DisassemblyViewContribution);
}
