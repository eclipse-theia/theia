// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import {
    AbstractViewContribution, KeybindingRegistry, Widget, CompositeTreeNode, LabelProvider, codicon, OnWillStopAction, FrontendApplicationContribution, ConfirmDialog, Dialog
} from '@theia/core/lib/browser';
import { TreeElementNode } from '@theia/core/lib/browser/source-tree';
import { injectable, inject } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';
import { MenuModelRegistry, CommandRegistry, Command, URI, Event, MessageService, CancellationError } from '@theia/core/lib/common';
import { waitForEvent } from '@theia/core/lib/common/promise-util';
import { EDITOR_CONTEXT_MENU, EDITOR_LINENUMBER_CONTEXT_MENU, EditorManager } from '@theia/editor/lib/browser';
import { DebugSessionManager } from './debug-session-manager';
import { DebugWidget } from './view/debug-widget';
import { FunctionBreakpoint, SourceBreakpoint } from './breakpoint/breakpoint-marker';
import { BreakpointManager } from './breakpoint/breakpoint-manager';
import { DebugConfigurationManager } from './debug-configuration-manager';
import { DebugState, DebugSession } from './debug-session';
import { DebugBreakpointsWidget } from './view/debug-breakpoints-widget';
import { DebugSourceBreakpoint } from './model/debug-source-breakpoint';
import { DebugThreadsWidget } from './view/debug-threads-widget';
import { DebugThread } from './model/debug-thread';
import { DebugStackFramesWidget } from './view/debug-stack-frames-widget';
import { DebugStackFrame } from './model/debug-stack-frame';
import { DebugVariablesWidget } from './view/debug-variables-widget';
import { DebugVariable } from './console/debug-console-items';
import { DebugSessionWidget } from './view/debug-session-widget';
import { DebugEditorModel } from './editor/debug-editor-model';
import { DebugEditorService } from './editor/debug-editor-service';
import { DebugConsoleContribution } from './console/debug-console-contribution';
import { DebugService } from '../common/debug-service';
import { DebugSchemaUpdater } from './debug-schema-updater';
import { DebugPreferences } from '../common/debug-preferences';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { DebugWatchWidget } from './view/debug-watch-widget';
import { DebugWatchExpression } from './view/debug-watch-expression';
import { DebugWatchManager } from './debug-watch-manager';
import { DebugSessionOptions } from './debug-session-options';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { DebugFunctionBreakpoint } from './model/debug-function-breakpoint';
import { DebugBreakpoint } from './model/debug-breakpoint';
import { nls } from '@theia/core/lib/common/nls';
import { DebugInstructionBreakpoint } from './model/debug-instruction-breakpoint';
import { DebugConfiguration } from '../common/debug-configuration';
import { DebugExceptionBreakpoint } from './view/debug-exception-breakpoint';
import { DebugToolBar } from './view/debug-toolbar-widget';
import { ConsoleWidget } from '@theia/console/lib/browser/console-widget';
import { ConsoleContentWidget } from '@theia/console/lib/browser/console-content-widget';
import { ConsoleContextMenu } from '@theia/console/lib/browser/console-contribution';
import { DebugHoverWidget } from './editor/debug-hover-widget';
import { DebugExpressionProvider } from './editor/debug-expression-provider';
import { AddOrEditDataBreakpointAddress } from './breakpoint/debug-data-breakpoint-actions';
import {
    DebugMenus, DebugCommands, DebugThreadContextCommands, DebugSessionContextCommands,
    DebugEditorContextCommands, DebugBreakpointWidgetCommands, nlsEnableBreakpoint, nlsDisableBreakpoint
} from './debug-commands';

@injectable()
export class DebugFrontendApplicationContribution extends AbstractViewContribution<DebugWidget>
    implements TabBarToolbarContribution, ColorContribution, FrontendApplicationContribution {

    @inject(DebugService)
    protected readonly debug: DebugService;

    @inject(DebugSessionManager)
    protected readonly manager: DebugSessionManager;

    @inject(DebugConfigurationManager)
    protected readonly configurations: DebugConfigurationManager;

    @inject(BreakpointManager)
    protected readonly breakpointManager: BreakpointManager;

    @inject(DebugEditorService)
    protected readonly editors: DebugEditorService;

    @inject(DebugConsoleContribution)
    protected readonly console: DebugConsoleContribution;

    @inject(DebugSchemaUpdater)
    protected readonly schemaUpdater: DebugSchemaUpdater;

    @inject(DebugPreferences)
    protected readonly preference: DebugPreferences;

    @inject(DebugWatchManager)
    protected readonly watchManager: DebugWatchManager;

    @inject(DebugExpressionProvider)
    protected readonly expressionProvider: DebugExpressionProvider;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(AddOrEditDataBreakpointAddress)
    protected readonly AddOrEditDataBreakpointAddress: AddOrEditDataBreakpointAddress;

    constructor() {
        super({
            widgetId: DebugWidget.ID,
            widgetName: DebugWidget.LABEL,
            defaultWidgetOptions: {
                area: 'left',
                rank: 400
            },
            toggleCommandId: 'debug:toggle',
            toggleKeybinding: 'ctrlcmd+shift+d'
        });
    }

    async initializeLayout(): Promise<void> {
        await this.openView();
    }

    protected firstSessionStart = true;
    async onStart(): Promise<void> {
        this.manager.onDidCreateDebugSession(session => this.openSession(session, { reveal: false }));
        this.manager.onDidStartDebugSession(session => {
            const { noDebug } = session.configuration;
            const openDebug = session.configuration.openDebug || this.preference['debug.openDebug'];
            const internalConsoleOptions = session.configuration.internalConsoleOptions || this.preference['debug.internalConsoleOptions'];
            if (internalConsoleOptions === 'openOnSessionStart' ||
                (internalConsoleOptions === 'openOnFirstSessionStart' && this.firstSessionStart)) {
                this.console.openView({
                    reveal: true,
                    activate: false,
                });
            }
            const shouldOpenDebug = openDebug === 'openOnSessionStart' || (openDebug === 'openOnFirstSessionStart' && this.firstSessionStart);
            // Do not open debug view when suppressed via configuration
            if (!noDebug && !this.getOption(session, 'suppressDebugView') && shouldOpenDebug) {
                this.openSession(session);
            }
            this.firstSessionStart = false;
        });
        this.manager.onDidStopDebugSession(session => {
            const { openDebug } = session.configuration;
            if (!this.getOption(session, 'suppressDebugView') && openDebug === 'openOnDebugBreak') {
                this.openSession(session);
            }
        });

        this.updateStatusBar();
        this.manager.onDidChange(() => this.updateStatusBar());

        this.schemaUpdater.update();
        this.configurations.load();
        this.breakpointManager.load();
        this.watchManager.load();
    }

    onStop(): void {
        this.configurations.save();
        this.breakpointManager.save();
        this.watchManager.save();
    }

    onWillStop(): OnWillStopAction | undefined {
        if (this.preference['debug.confirmOnExit'] === 'always' && this.manager.currentSession) {
            return {
                reason: 'active-debug-sessions',
                action: async () => {
                    if (this.manager.currentSession) {
                        const msg = this.manager.sessions.length === 1
                            ? nls.localizeByDefault('There is an active debug session, are you sure you want to stop it?')
                            : nls.localizeByDefault('There are active debug sessions, are you sure you want to stop them?');
                        const safeToExit = await new ConfirmDialog({
                            title: '',
                            msg,
                            ok: nls.localizeByDefault('Stop Debugging'),
                            cancel: Dialog.CANCEL,
                        }).open();
                        return safeToExit === true;
                    }
                    return true;
                },
            };
        }
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        const registerMenuActions = (menuPath: string[], ...commands: (Command & { order?: string, when?: string })[]) => {
            for (const [index, command] of commands.entries()) {
                const label = command.label;
                const debug = `${DebugCommands.DEBUG_CATEGORY}:`;
                menus.registerMenuAction(menuPath, {
                    commandId: command.id,
                    label: label && label.startsWith(debug) && label.slice(debug.length).trimStart() || label,
                    icon: command.iconClass,
                    when: command.when,
                    order: command.order || String.fromCharCode('a'.charCodeAt(0) + index)
                });
            }
        };

        menus.registerSubmenu(DebugMenus.DEBUG, nls.localizeByDefault('Run'));
        registerMenuActions(DebugMenus.DEBUG_CONTROLS,
            DebugCommands.START,
            DebugCommands.START_NO_DEBUG,
            DebugCommands.STOP,
            DebugCommands.RESTART
        );
        registerMenuActions(DebugMenus.DEBUG_CONFIGURATION,
            DebugCommands.OPEN_CONFIGURATIONS,
            DebugCommands.ADD_CONFIGURATION
        );
        registerMenuActions(DebugMenus.DEBUG_THREADS,
            DebugCommands.CONTINUE,
            DebugCommands.STEP_OVER,
            DebugCommands.STEP_INTO,
            DebugCommands.STEP_OUT,
            DebugCommands.PAUSE
        );
        registerMenuActions(DebugMenus.DEBUG_SESSIONS,
            DebugCommands.CONTINUE_ALL,
            DebugCommands.PAUSE_ALL
        );
        registerMenuActions(DebugMenus.DEBUG_BREAKPOINT,
            DebugCommands.TOGGLE_BREAKPOINT
        );
        menus.registerSubmenu(DebugMenus.DEBUG_NEW_BREAKPOINT, nls.localizeByDefault('New Breakpoint'));
        registerMenuActions(DebugMenus.DEBUG_NEW_BREAKPOINT,
            DebugCommands.ADD_CONDITIONAL_BREAKPOINT,
            DebugCommands.INLINE_BREAKPOINT,
            DebugCommands.ADD_FUNCTION_BREAKPOINT,
            DebugCommands.ADD_LOGPOINT,
            DebugCommands.ADD_DATA_BREAKPOINT
        );
        registerMenuActions(DebugMenus.DEBUG_BREAKPOINTS,
            DebugCommands.ENABLE_ALL_BREAKPOINTS,
            DebugCommands.DISABLE_ALL_BREAKPOINTS,
            DebugCommands.REMOVE_ALL_BREAKPOINTS
        );

        registerMenuActions(DebugThreadsWidget.CONTROL_MENU,
            { ...DebugCommands.PAUSE, ...DebugThreadContextCommands.PAUSE },
            { ...DebugCommands.CONTINUE, ...DebugThreadContextCommands.CONTINUE },
            { ...DebugCommands.STEP_OVER, ...DebugThreadContextCommands.STEP_OVER },
            { ...DebugCommands.STEP_INTO, ...DebugThreadContextCommands.STEP_INTO },
            { ...DebugCommands.STEP_OUT, ...DebugThreadContextCommands.STEP_OUT },
            { ...DebugCommands.PAUSE_ALL, ...DebugSessionContextCommands.PAUSE_ALL },
            { ...DebugCommands.CONTINUE_ALL, ...DebugSessionContextCommands.CONTINUE_ALL }
        );
        registerMenuActions(DebugThreadsWidget.TERMINATE_MENU,
            { ...DebugCommands.RESTART, ...DebugSessionContextCommands.RESTART },
            { ...DebugCommands.STOP, ...DebugSessionContextCommands.STOP },
            { ...DebugThreadContextCommands.TERMINATE, label: nls.localizeByDefault('Terminate Thread') }
        );
        registerMenuActions(DebugThreadsWidget.OPEN_MENU, { ...DebugSessionContextCommands.REVEAL, label: nls.localize('theia/debug/reveal', 'Reveal') });

        registerMenuActions(DebugStackFramesWidget.CONTEXT_MENU,
            DebugCommands.RESTART_FRAME,
            DebugCommands.COPY_CALL_STACK
        );

        registerMenuActions(ConsoleContextMenu.CLIPBOARD,
            { ...DebugCommands.COPY_VARIABLE_VALUE, order: 'a1a' },
            { ...DebugCommands.COPY_VARIABLE_AS_EXPRESSION, order: 'a1b' }
        );
        registerMenuActions(DebugVariablesWidget.EDIT_MENU,
            DebugCommands.SET_VARIABLE_VALUE,
            DebugCommands.COPY_VARIABLE_VALUE,
            DebugCommands.COPY_VARIABLE_AS_EXPRESSION
        );
        registerMenuActions(DebugVariablesWidget.WATCH_MENU,
            DebugCommands.WATCH_VARIABLE
        );
        registerMenuActions(DebugHoverWidget.EDIT_MENU,
            DebugCommands.COPY_VARIABLE_VALUE,
            DebugCommands.COPY_VARIABLE_AS_EXPRESSION
        );
        registerMenuActions(DebugHoverWidget.WATCH_MENU,
            DebugCommands.WATCH_VARIABLE
        );

        registerMenuActions(DebugWatchWidget.EDIT_MENU,
            DebugCommands.EDIT_WATCH_EXPRESSION,
            DebugCommands.COPY_WATCH_EXPRESSION_VALUE
        );
        registerMenuActions(DebugWatchWidget.REMOVE_MENU,
            DebugCommands.REMOVE_WATCH_EXPRESSION,
            DebugCommands.REMOVE_ALL_WATCH_EXPRESSIONS
        );

        registerMenuActions(DebugBreakpointsWidget.EDIT_MENU,
            DebugCommands.EDIT_BREAKPOINT,
            { ...DebugCommands.ADD_DATA_BREAKPOINT, label: nls.localizeByDefault('Edit Address...'), originalLabel: 'Edit Address...' },
            DebugCommands.EDIT_LOGPOINT,
            DebugCommands.EDIT_BREAKPOINT_CONDITION
        );
        registerMenuActions(DebugBreakpointsWidget.REMOVE_MENU,
            DebugCommands.REMOVE_BREAKPOINT,
            DebugCommands.REMOVE_LOGPOINT,
            DebugCommands.REMOVE_SELECTED_BREAKPOINTS,
            DebugCommands.REMOVE_ALL_BREAKPOINTS
        );
        registerMenuActions(DebugBreakpointsWidget.ENABLE_MENU,
            DebugCommands.ENABLE_SELECTED_BREAKPOINTS,
            DebugCommands.DISABLE_SELECTED_BREAKPOINTS,
            DebugCommands.ENABLE_ALL_BREAKPOINTS,
            DebugCommands.DISABLE_ALL_BREAKPOINTS
        );

        const DEBUG_EDITOR_CONTEXT_MENU_GROUP = [...EDITOR_CONTEXT_MENU, '2_debug'];
        registerMenuActions(DEBUG_EDITOR_CONTEXT_MENU_GROUP,
            DebugCommands.EVALUATE_IN_DEBUG_CONSOLE,
            DebugCommands.ADD_TO_WATCH,
            DebugCommands.JUMP_TO_CURSOR,
            DebugCommands.RUN_TO_CURSOR,
            DebugCommands.RUN_TO_LINE
        );

        registerMenuActions([...DebugEditorModel.CONTEXT_MENU, '1_breakpoint'],
            { ...DebugEditorContextCommands.ADD_BREAKPOINT, label: nls.localizeByDefault('Add Breakpoint') },
            { ...DebugEditorContextCommands.ADD_CONDITIONAL_BREAKPOINT, label: DebugCommands.ADD_CONDITIONAL_BREAKPOINT.label },
            { ...DebugEditorContextCommands.ADD_LOGPOINT, label: DebugCommands.ADD_LOGPOINT.label },
            { ...DebugEditorContextCommands.REMOVE_BREAKPOINT, label: DebugCommands.REMOVE_BREAKPOINT.label },
            { ...DebugEditorContextCommands.EDIT_BREAKPOINT, label: DebugCommands.EDIT_BREAKPOINT.label },
            { ...DebugEditorContextCommands.ENABLE_BREAKPOINT, label: nlsEnableBreakpoint('Breakpoint') },
            { ...DebugEditorContextCommands.DISABLE_BREAKPOINT, label: nlsDisableBreakpoint('Breakpoint') },
            { ...DebugEditorContextCommands.REMOVE_LOGPOINT, label: DebugCommands.REMOVE_LOGPOINT.label },
            { ...DebugEditorContextCommands.EDIT_LOGPOINT, label: DebugCommands.EDIT_LOGPOINT.label },
            { ...DebugEditorContextCommands.ENABLE_LOGPOINT, label: nlsEnableBreakpoint('Logpoint') },
            { ...DebugEditorContextCommands.DISABLE_LOGPOINT, label: nlsDisableBreakpoint('Logpoint') }
        );
        registerMenuActions([...DebugEditorModel.CONTEXT_MENU, '2_control'],
            { ...DebugEditorContextCommands.JUMP_TO_CURSOR, label: nls.localizeByDefault('Jump to Cursor') },
            { ...DebugEditorContextCommands.RUN_TO_LINE, label: DebugCommands.RUN_TO_LINE.label }
        );
        menus.linkCompoundMenuNode({ newParentPath: EDITOR_LINENUMBER_CONTEXT_MENU, submenuPath: DebugEditorModel.CONTEXT_MENU });

        menus.registerSubmenu(DebugToolBar.MENU, nls.localize('theia/debug/debugToolbarMenu', 'Debug Toolbar Menu'));
        registerMenuActions(DebugToolBar.CONTROLS,
            { ...DebugCommands.CONTINUE, when: 'debugState == stopped' },
            { ...DebugCommands.PAUSE, when: 'debugState != stopped' },
            DebugCommands.STEP_OVER,
            DebugCommands.STEP_INTO,
            DebugCommands.STEP_OUT,
            DebugCommands.RESTART,
            DebugCommands.STOP
        );
    }

    override registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        registry.registerCommand(DebugCommands.START, {
            execute: (config?: DebugSessionOptions) => {
                const validConfig = DebugSessionOptions.is(config) ? config : undefined;
                return this.start(false, validConfig);
            }
        });
        registry.registerCommand(DebugCommands.START_NO_DEBUG, {
            execute: (config?: DebugSessionOptions) => {
                const validConfig = DebugSessionOptions.is(config) ? config : undefined;
                return this.start(true, validConfig);
            }
        });
        registry.registerCommand(DebugCommands.STOP, {
            execute: () => this.manager.terminateSession(),
            isEnabled: () => this.manager.state !== DebugState.Inactive
        });
        registry.registerCommand(DebugCommands.RESTART, {
            execute: () => this.manager.restartSession(),
            isEnabled: () => this.manager.state !== DebugState.Inactive
        });

        registry.registerCommand(DebugCommands.OPEN_CONFIGURATIONS, {
            execute: () => this.configurations.openConfiguration()
        });
        registry.registerCommand(DebugCommands.ADD_CONFIGURATION, {
            execute: () => this.configurations.addConfiguration()
        });

        registry.registerCommand(DebugCommands.STEP_OVER, {
            execute: () => this.manager.currentThread && this.manager.currentThread.stepOver(),
            isEnabled: () => this.manager.state === DebugState.Stopped
        });
        registry.registerCommand(DebugCommands.STEP_INTO, {
            execute: () => this.manager.currentThread && this.manager.currentThread.stepIn(),
            isEnabled: () => this.manager.state === DebugState.Stopped
        });
        registry.registerCommand(DebugCommands.STEP_OUT, {
            execute: () => this.manager.currentThread && this.manager.currentThread.stepOut(),
            isEnabled: () => this.manager.state === DebugState.Stopped
        });
        registry.registerCommand(DebugCommands.CONTINUE, {
            execute: () => {
                if (this.manager.state === DebugState.Stopped && this.manager.currentThread) {
                    this.manager.currentThread.continue();
                }
            },
            // When there is a debug session, F5 should always be captured by this command
            isEnabled: () => this.manager.state !== DebugState.Inactive
        });
        registry.registerCommand(DebugCommands.PAUSE, {
            execute: () => this.manager.currentThread && this.manager.currentThread.pause(),
            isEnabled: () => this.manager.state === DebugState.Running
        });
        registry.registerCommand(DebugCommands.PAUSE_ALL, {
            execute: () => this.manager.currentSession && this.manager.currentSession.pauseAll(),
            isEnabled: () => !!this.manager.currentSession && !!this.manager.currentSession.runningThreads.next().value
        });
        registry.registerCommand(DebugCommands.CONTINUE_ALL, {
            execute: () => this.manager.currentSession && this.manager.currentSession.continueAll(),
            isEnabled: () => !!this.manager.currentSession && !!this.manager.currentSession.stoppedThreads.next().value
        });

        registry.registerCommand(DebugThreadContextCommands.STEP_OVER, {
            execute: () => this.selectedThread && this.selectedThread.stepOver(),
            isEnabled: () => !!this.selectedThread && this.selectedThread.stopped,
            isVisible: () => !!this.selectedThread
        });
        registry.registerCommand(DebugThreadContextCommands.STEP_INTO, {
            execute: () => this.selectedThread && this.selectedThread.stepIn(),
            isEnabled: () => !!this.selectedThread && this.selectedThread.stopped,
            isVisible: () => !!this.selectedThread
        });
        registry.registerCommand(DebugThreadContextCommands.STEP_OUT, {
            execute: () => this.selectedThread && this.selectedThread.stepOut(),
            isEnabled: () => !!this.selectedThread && this.selectedThread.stopped,
            isVisible: () => !!this.selectedThread
        });
        registry.registerCommand(DebugThreadContextCommands.CONTINUE, {
            execute: () => this.selectedThread && this.selectedThread.continue(),
            isEnabled: () => !!this.selectedThread && this.selectedThread.stopped,
            isVisible: () => !!this.selectedThread && this.selectedThread.stopped,
        });
        registry.registerCommand(DebugThreadContextCommands.PAUSE, {
            execute: () => this.selectedThread && this.selectedThread.pause(),
            isEnabled: () => !!this.selectedThread && !this.selectedThread.stopped,
            isVisible: () => !!this.selectedThread && !this.selectedThread.stopped,
        });
        registry.registerCommand(DebugThreadContextCommands.TERMINATE, {
            execute: () => this.selectedThread && this.selectedThread.terminate(),
            isEnabled: () => !!this.selectedThread && this.selectedThread.supportsTerminate,
            isVisible: () => !!this.selectedThread && this.selectedThread.supportsTerminate
        });

        registry.registerCommand(DebugSessionContextCommands.STOP, {
            execute: () => this.selectedSession && this.manager.terminateSession(this.selectedSession),
            isEnabled: () => !!this.selectedSession && this.selectedSession.state !== DebugState.Inactive,
            isVisible: () => !this.selectedThread
        });
        registry.registerCommand(DebugSessionContextCommands.RESTART, {
            execute: () => this.selectedSession && this.manager.restartSession(this.selectedSession),
            isEnabled: () => !!this.selectedSession && this.selectedSession.state !== DebugState.Inactive,
            isVisible: () => !this.selectedThread
        });
        registry.registerCommand(DebugSessionContextCommands.CONTINUE_ALL, {
            execute: () => this.selectedSession && this.selectedSession.continueAll(),
            isEnabled: () => !!this.selectedSession && !!this.selectedSession.stoppedThreads.next().value,
            isVisible: () => !this.selectedThread
        });
        registry.registerCommand(DebugSessionContextCommands.PAUSE_ALL, {
            execute: () => this.selectedSession && this.selectedSession.pauseAll(),
            isEnabled: () => !!this.selectedSession && !!this.selectedSession.runningThreads.next().value,
            isVisible: () => !this.selectedThread
        });
        registry.registerCommand(DebugSessionContextCommands.REVEAL, {
            execute: () => this.selectedSession && this.revealSession(this.selectedSession),
            isEnabled: () => Boolean(this.selectedSession),
            isVisible: () => !this.selectedThread && Boolean(this.selectedSession)
        });
        registry.registerCommand(DebugCommands.TOGGLE_BREAKPOINT, {
            execute: () => this.editors.toggleBreakpoint(),
            isEnabled: () => !!this.editors.model
        });
        registry.registerCommand(DebugCommands.INLINE_BREAKPOINT, {
            execute: () => this.editors.addInlineBreakpoint(),
            isEnabled: () => !!this.editors.model && !this.editors.getInlineBreakpoint()
        });
        registry.registerCommand(DebugCommands.ADD_CONDITIONAL_BREAKPOINT, {
            execute: () => this.editors.addBreakpoint('condition'),
            isEnabled: () => !!this.editors.model && !this.editors.anyBreakpoint()
        });
        registry.registerCommand(DebugCommands.ADD_LOGPOINT, {
            execute: () => this.editors.addBreakpoint('logMessage'),
            isEnabled: () => !!this.editors.model && !this.editors.anyBreakpoint()
        });
        registry.registerCommand(DebugCommands.ADD_FUNCTION_BREAKPOINT, {
            execute: async () => {
                const { labelProvider, breakpointManager, editorManager } = this;
                const options = { labelProvider, breakpoints: breakpointManager, editorManager };
                await new DebugFunctionBreakpoint(FunctionBreakpoint.create({ name: '' }), options).open();
            },
            isEnabled: widget => !(widget instanceof Widget) || widget instanceof DebugBreakpointsWidget,
            isVisible: widget => !(widget instanceof Widget) || widget instanceof DebugBreakpointsWidget
        });
        registry.registerCommand(DebugCommands.ADD_DATA_BREAKPOINT, this.AddOrEditDataBreakpointAddress);
        registry.registerCommand(DebugCommands.ENABLE_ALL_BREAKPOINTS, {
            execute: () => this.breakpointManager.enableAllBreakpoints(true),
            isEnabled: () => this.breakpointManager.hasBreakpoints()
        });
        registry.registerCommand(DebugCommands.ENABLE_SELECTED_BREAKPOINTS, {
            execute: () => this.selectedBreakpoints.forEach(breakpoint => breakpoint.setEnabled(true)),
            isVisible: () => this.selectedBreakpoints.some(breakpoint => !breakpoint.enabled),
            isEnabled: () => this.selectedBreakpoints.some(breakpoint => !breakpoint.enabled)
        });
        registry.registerCommand(DebugCommands.DISABLE_ALL_BREAKPOINTS, {
            execute: () => this.breakpointManager.enableAllBreakpoints(false),
            isEnabled: () => this.breakpointManager.hasBreakpoints()
        });
        registry.registerCommand(DebugCommands.DISABLE_SELECTED_BREAKPOINTS, {
            execute: () => this.selectedBreakpoints.forEach(breakpoint => breakpoint.setEnabled(false)),
            isVisible: () => this.selectedBreakpoints.some(breakpoint => breakpoint.enabled),
            isEnabled: () => this.selectedBreakpoints.some(breakpoint => breakpoint.enabled)
        });
        registry.registerCommand(DebugCommands.EDIT_BREAKPOINT, {
            execute: async () => {
                const { selectedBreakpoint, selectedFunctionBreakpoint, selectedLogpoint } = this;
                if (selectedBreakpoint) {
                    await this.editors.editBreakpoint(selectedBreakpoint);
                } else if (selectedFunctionBreakpoint) {
                    await selectedFunctionBreakpoint.open();
                } else if (selectedLogpoint) {
                    await this.editors.editBreakpoint(selectedLogpoint);
                }
            },
            isEnabled: () => this.selectedBreakpoints.length === 1 && (!!this.selectedBreakpoint || !!this.selectedFunctionBreakpoint || !!this.selectedLogpoint),
            isVisible: () => this.selectedBreakpoints.length === 1 && (!!this.selectedBreakpoint || !!this.selectedFunctionBreakpoint || !!this.selectedLogpoint)
        });
        registry.registerCommand(DebugCommands.EDIT_LOGPOINT, {
            execute: async () => {
                const { selectedLogpoint } = this;
                if (selectedLogpoint) {
                    await this.editors.editBreakpoint(selectedLogpoint);
                }
            },
            isEnabled: () => this.selectedBreakpoints.length === 1 && !!this.selectedLogpoint,
            isVisible: () => this.selectedBreakpoints.length === 1 && !!this.selectedLogpoint
        });
        registry.registerCommand(DebugCommands.EDIT_BREAKPOINT_CONDITION, {
            execute: async () => {
                const { selectedExceptionBreakpoint } = this;
                if (selectedExceptionBreakpoint) {
                    await selectedExceptionBreakpoint.editCondition();
                }
            },
            isEnabled: () => !!this.selectedExceptionBreakpoint?.data.raw.supportsCondition,
            isVisible: () => !!this.selectedExceptionBreakpoint?.data.raw.supportsCondition
        });
        registry.registerCommand(DebugCommands.REMOVE_BREAKPOINT, {
            execute: () => {
                const selectedBreakpoint = this.selectedSettableBreakpoint;
                if (selectedBreakpoint) {
                    selectedBreakpoint.remove();
                }
            },
            isEnabled: () => this.selectedBreakpoints.length === 1 && Boolean(this.selectedSettableBreakpoint),
            isVisible: () => this.selectedBreakpoints.length === 1 && Boolean(this.selectedSettableBreakpoint),
        });
        registry.registerCommand(DebugCommands.REMOVE_LOGPOINT, {
            execute: () => {
                const { selectedLogpoint } = this;
                if (selectedLogpoint) {
                    selectedLogpoint.remove();
                }
            },
            isEnabled: () => this.selectedBreakpoints.length === 1 && !!this.selectedLogpoint,
            isVisible: () => this.selectedBreakpoints.length === 1 && !!this.selectedLogpoint
        });
        registry.registerCommand(DebugCommands.REMOVE_ALL_BREAKPOINTS, {
            execute: () => this.breakpointManager.removeBreakpoints(),
            isEnabled: () => this.breakpointManager.hasBreakpoints(),
            isVisible: widget => !(widget instanceof Widget) || (widget instanceof DebugBreakpointsWidget)
        });
        registry.registerCommand(DebugCommands.REMOVE_SELECTED_BREAKPOINTS, {
            execute: () => this.selectedBreakpoints.forEach(breakpoint => breakpoint.remove()),
            isEnabled: () => this.selectedBreakpoints.length > 1,
            isVisible: widget => (!(widget instanceof Widget) || (widget instanceof DebugBreakpointsWidget)) && this.selectedBreakpoints.length > 1
        });
        registry.registerCommand(DebugCommands.TOGGLE_BREAKPOINTS_ENABLED, {
            execute: () => this.breakpointManager.breakpointsEnabled = !this.breakpointManager.breakpointsEnabled,
            isVisible: arg => arg instanceof DebugBreakpointsWidget
        });
        registry.registerCommand(DebugCommands.SHOW_HOVER, {
            execute: () => this.editors.showHover(),
            isEnabled: () => this.editors.canShowHover()
        });

        registry.registerCommand(DebugCommands.EVALUATE_IN_DEBUG_CONSOLE, {
            execute: async () => {
                const { model } = this.editors;
                if (model) {
                    const { editor } = model;
                    const { selection, document } = editor;
                    const value = document.getText(selection) || document.getLineContent(selection.start.line + 1).trim();
                    const consoleWidget = await this.console.openView({ reveal: true, activate: false });
                    await consoleWidget.execute(value);
                }
            },
            isEnabled: () => !!this.editors.model && !!this.manager.currentFrame,
            isVisible: () => !!this.editors.model && !!this.manager.currentFrame
        });

        registry.registerCommand(DebugCommands.ADD_TO_WATCH, {
            execute: async () => {
                const { model } = this.editors;
                if (model) {
                    const { editor } = model;
                    const selection = editor.getControl().getSelection();
                    if (selection) {
                        const expression = editor.getControl().getModel()?.getValueInRange(selection) ||
                            (await this.expressionProvider.getEvaluatableExpression(editor, selection))?.matchingExpression;
                        if (expression) {
                            this.watchManager.addWatchExpression(expression);
                            const watchWidget = this.widgetManager.tryGetWidget(DebugWatchWidget.FACTORY_ID);
                            if (watchWidget) {
                                await this.shell.activateWidget(watchWidget.id);
                            }
                        }
                    }
                }
            },
            isEnabled: () => !!this.editors.model && this.manager.inDebugMode,
            isVisible: () => !!this.editors.model && this.manager.inDebugMode
        });

        registry.registerCommand(DebugCommands.JUMP_TO_CURSOR, {
            execute: () => {
                const model = this.editors.model;
                if (model && this.manager.currentThread) {
                    this.manager.currentThread.jumpToCursor(
                        model.editor.getResourceUri(),
                        model.position
                    );
                }
            },
            isEnabled: () => !!this.manager.currentThread && this.manager.currentThread.supportsGoto,
            isVisible: () => !!this.manager.currentThread && this.manager.currentThread.supportsGoto
        });

        registry.registerCommand(DebugCommands.RUN_TO_CURSOR, {
            execute: async () => {
                const { model } = this.editors;
                if (model) {
                    const { editor, position } = model;
                    await this.runTo(editor.getResourceUri(), position.lineNumber, position.column);
                }
            },
            isEnabled: () => !!this.editors.model && !!this.manager.currentThread?.stopped,
            isVisible: () => !!this.editors.model && !!this.manager.currentThread?.stopped
        });
        registry.registerCommand(DebugCommands.RUN_TO_LINE, {
            execute: async () => {
                const { model } = this.editors;
                if (model) {
                    const { editor, position } = model;
                    await this.runTo(editor.getResourceUri(), position.lineNumber);
                }
            },
            isEnabled: () => !!this.editors.model && !!this.manager.currentThread?.stopped,
            isVisible: () => !!this.editors.model && !!this.manager.currentThread?.stopped
        });

        registry.registerCommand(DebugCommands.RESTART_FRAME, {
            execute: () => this.selectedFrame && this.selectedFrame.restart(),
            isEnabled: () => !!this.selectedFrame
        });
        registry.registerCommand(DebugCommands.COPY_CALL_STACK, {
            execute: () => {
                const { frames } = this;
                const selection = document.getSelection();
                if (frames && selection) {
                    selection.selectAllChildren(frames.node);
                    document.execCommand('copy');
                }
            },
            isEnabled: () => document.queryCommandSupported('copy'),
            isVisible: () => document.queryCommandSupported('copy')
        });

        registry.registerCommand(DebugCommands.SET_VARIABLE_VALUE, {
            execute: () => this.selectedVariable && this.selectedVariable.open(),
            isEnabled: () => !!this.selectedVariable && this.selectedVariable.supportSetVariable && !this.selectedVariable.readOnly,
            isVisible: () => !!this.selectedVariable && this.selectedVariable.supportSetVariable
        });
        registry.registerCommand(DebugCommands.COPY_VARIABLE_VALUE, {
            execute: () => this.selectedVariable && this.selectedVariable.copyValue(),
            isEnabled: () => !!this.selectedVariable && this.selectedVariable.supportCopyValue,
            isVisible: () => !!this.selectedVariable && this.selectedVariable.supportCopyValue
        });
        registry.registerCommand(DebugCommands.COPY_VARIABLE_AS_EXPRESSION, {
            execute: () => this.selectedVariable && this.selectedVariable.copyAsExpression(),
            isEnabled: () => !!this.selectedVariable && this.selectedVariable.supportCopyAsExpression,
            isVisible: () => !!this.selectedVariable && this.selectedVariable.supportCopyAsExpression
        });
        registry.registerCommand(DebugCommands.WATCH_VARIABLE, {
            execute: () => {
                const evaluateName = this.selectedVariable?.evaluateName;
                if (evaluateName) {
                    this.watchManager.addWatchExpression(evaluateName);
                }
            },
            isEnabled: () => !!this.selectedVariable?.evaluateName,
            isVisible: () => !!this.selectedVariable?.evaluateName,
        });

        // Debug context menu commands
        registry.registerCommand(DebugEditorContextCommands.ADD_BREAKPOINT, {
            execute: position => this.isPosition(position) && this.editors.toggleBreakpoint(this.asPosition(position)),
            isEnabled: position => this.isPosition(position) && !this.editors.anyBreakpoint(this.asPosition(position)),
            isVisible: position => this.isPosition(position) && !this.editors.anyBreakpoint(this.asPosition(position))
        });
        registry.registerCommand(DebugEditorContextCommands.ADD_CONDITIONAL_BREAKPOINT, {
            execute: position => this.isPosition(position) && this.editors.addBreakpoint('condition', this.asPosition(position)),
            isEnabled: position => this.isPosition(position) && !this.editors.anyBreakpoint(this.asPosition(position)),
            isVisible: position => this.isPosition(position) && !this.editors.anyBreakpoint(this.asPosition(position))
        });
        registry.registerCommand(DebugEditorContextCommands.ADD_LOGPOINT, {
            execute: position => this.isPosition(position) && this.editors.addBreakpoint('logMessage', this.asPosition(position)),
            isEnabled: position => this.isPosition(position) && !this.editors.anyBreakpoint(this.asPosition(position)),
            isVisible: position => this.isPosition(position) && !this.editors.anyBreakpoint(this.asPosition(position))
        });
        registry.registerCommand(DebugEditorContextCommands.REMOVE_BREAKPOINT, {
            execute: position => this.isPosition(position) && this.editors.toggleBreakpoint(this.asPosition(position)),
            isEnabled: position => this.isPosition(position) && !!this.editors.getBreakpoint(this.asPosition(position)),
            isVisible: position => this.isPosition(position) && !!this.editors.getBreakpoint(this.asPosition(position))
        });
        registry.registerCommand(DebugEditorContextCommands.EDIT_BREAKPOINT, {
            execute: position => this.isPosition(position) && this.editors.editBreakpoint(this.asPosition(position)),
            isEnabled: position => this.isPosition(position) && !!this.editors.getBreakpoint(this.asPosition(position)),
            isVisible: position => this.isPosition(position) && !!this.editors.getBreakpoint(this.asPosition(position))
        });
        registry.registerCommand(DebugEditorContextCommands.ENABLE_BREAKPOINT, {
            execute: position => this.isPosition(position) && this.editors.setBreakpointEnabled(this.asPosition(position), true),
            isEnabled: position => this.isPosition(position) && this.editors.getBreakpointEnabled(this.asPosition(position)) === false,
            isVisible: position => this.isPosition(position) && this.editors.getBreakpointEnabled(this.asPosition(position)) === false
        });
        registry.registerCommand(DebugEditorContextCommands.DISABLE_BREAKPOINT, {
            execute: position => this.isPosition(position) && this.editors.setBreakpointEnabled(this.asPosition(position), false),
            isEnabled: position => this.isPosition(position) && !!this.editors.getBreakpointEnabled(this.asPosition(position)),
            isVisible: position => this.isPosition(position) && !!this.editors.getBreakpointEnabled(this.asPosition(position))
        });
        registry.registerCommand(DebugEditorContextCommands.REMOVE_LOGPOINT, {
            execute: position => this.isPosition(position) && this.editors.toggleBreakpoint(this.asPosition(position)),
            isEnabled: position => this.isPosition(position) && !!this.editors.getLogpoint(this.asPosition(position)),
            isVisible: position => this.isPosition(position) && !!this.editors.getLogpoint(this.asPosition(position))
        });
        registry.registerCommand(DebugEditorContextCommands.EDIT_LOGPOINT, {
            execute: position => this.isPosition(position) && this.editors.editBreakpoint(this.asPosition(position)),
            isEnabled: position => this.isPosition(position) && !!this.editors.getLogpoint(this.asPosition(position)),
            isVisible: position => this.isPosition(position) && !!this.editors.getLogpoint(this.asPosition(position))
        });
        registry.registerCommand(DebugEditorContextCommands.ENABLE_LOGPOINT, {
            execute: position => this.isPosition(position) && this.editors.setBreakpointEnabled(this.asPosition(position), true),
            isEnabled: position => this.isPosition(position) && this.editors.getLogpointEnabled(this.asPosition(position)) === false,
            isVisible: position => this.isPosition(position) && this.editors.getLogpointEnabled(this.asPosition(position)) === false
        });
        registry.registerCommand(DebugEditorContextCommands.DISABLE_LOGPOINT, {
            execute: position => this.isPosition(position) && this.editors.setBreakpointEnabled(this.asPosition(position), false),
            isEnabled: position => this.isPosition(position) && !!this.editors.getLogpointEnabled(this.asPosition(position)),
            isVisible: position => this.isPosition(position) && !!this.editors.getLogpointEnabled(this.asPosition(position))
        });
        registry.registerCommand(DebugEditorContextCommands.JUMP_TO_CURSOR, {
            execute: position => {
                if (this.isPosition(position) && this.editors.currentUri && this.manager.currentThread) {
                    this.manager.currentThread.jumpToCursor(this.editors.currentUri, this.asPosition(position));
                }
            },
            isEnabled: () => !!this.manager.currentThread && this.manager.currentThread.supportsGoto,
            isVisible: () => !!this.manager.currentThread && this.manager.currentThread.supportsGoto
        });
        registry.registerCommand(DebugEditorContextCommands.RUN_TO_LINE, {
            execute: async position => {
                if (this.isPosition(position)) {
                    const { currentUri } = this.editors;
                    if (currentUri) {
                        await this.runTo(currentUri, position.lineNumber);
                    }
                }
            },
            isEnabled: position => this.isPosition(position) && !!this.editors.currentUri && !!this.manager.currentThread?.stopped,
            isVisible: position => this.isPosition(position) && !!this.editors.currentUri && !!this.manager.currentThread?.stopped
        });

        registry.registerCommand(DebugBreakpointWidgetCommands.ACCEPT, {
            execute: () => this.editors.acceptBreakpoint()
        });
        registry.registerCommand(DebugBreakpointWidgetCommands.CLOSE, {
            execute: () => this.editors.closeBreakpoint()
        });

        registry.registerCommand(DebugCommands.ADD_WATCH_EXPRESSION, {
            execute: widget => {
                if (widget instanceof Widget) {
                    if (widget instanceof DebugWatchWidget) {
                        widget.viewModel.addWatchExpression();
                    }
                } else if (this.watch) {
                    this.watch.viewModel.addWatchExpression();
                }
            },
            isEnabled: widget => widget instanceof Widget ? widget instanceof DebugWatchWidget : !!this.watch,
            isVisible: widget => widget instanceof Widget ? widget instanceof DebugWatchWidget : !!this.watch
        });
        registry.registerCommand(DebugCommands.EDIT_WATCH_EXPRESSION, {
            execute: () => {
                const { watchExpression } = this;
                if (watchExpression) {
                    watchExpression.open();
                }
            },
            isEnabled: () => !!this.watchExpression,
            isVisible: () => !!this.watchExpression
        });
        registry.registerCommand(DebugCommands.COPY_WATCH_EXPRESSION_VALUE, {
            execute: () => this.watchExpression && this.watchExpression.copyValue(),
            isEnabled: () => !!this.watchExpression && this.watchExpression.supportCopyValue,
            isVisible: () => !!this.watchExpression && this.watchExpression.supportCopyValue
        });
        registry.registerCommand(DebugCommands.COLLAPSE_ALL_WATCH_EXPRESSIONS, {
            execute: widget => {
                if (widget instanceof DebugWatchWidget) {
                    const root = widget.model.root;
                    widget.model.collapseAll(CompositeTreeNode.is(root) ? root : undefined);
                }
            },
            isEnabled: widget => widget instanceof DebugWatchWidget,
            isVisible: widget => widget instanceof DebugWatchWidget
        });
        registry.registerCommand(DebugCommands.REMOVE_WATCH_EXPRESSION, {
            execute: () => {
                const { watch, watchExpression } = this;
                if (watch && watchExpression) {
                    watch.viewModel.removeWatchExpression(watchExpression);
                }
            },
            isEnabled: () => !!this.watchExpression,
            isVisible: () => !!this.watchExpression
        });
        registry.registerCommand(DebugCommands.REMOVE_ALL_WATCH_EXPRESSIONS, {
            execute: widget => {
                if (widget instanceof Widget) {
                    if (widget instanceof DebugWatchWidget) {
                        widget.viewModel.removeWatchExpressions();
                    }
                } else if (this.watch) {
                    this.watch.viewModel.removeWatchExpressions();
                }
            },
            isEnabled: widget => widget instanceof Widget ? widget instanceof DebugWatchWidget : !!this.watch,
            isVisible: widget => widget instanceof Widget ? widget instanceof DebugWatchWidget : !!this.watch
        });
    }

    override registerKeybindings(keybindings: KeybindingRegistry): void {
        super.registerKeybindings(keybindings);
        keybindings.registerKeybinding({
            command: DebugCommands.START.id,
            keybinding: 'f5',
            when: '!inDebugMode'
        });
        keybindings.registerKeybinding({
            command: DebugCommands.START_NO_DEBUG.id,
            keybinding: 'ctrl+f5',
            when: '!inDebugMode'
        });
        keybindings.registerKeybinding({
            command: DebugCommands.STOP.id,
            keybinding: 'shift+f5',
            when: 'inDebugMode'
        });

        keybindings.registerKeybinding({
            command: DebugCommands.RESTART.id,
            keybinding: 'shift+ctrlcmd+f5',
            when: 'inDebugMode'
        });
        keybindings.registerKeybinding({
            command: DebugCommands.STEP_OVER.id,
            keybinding: 'f10',
            when: 'inDebugMode'
        });
        keybindings.registerKeybinding({
            command: DebugCommands.STEP_INTO.id,
            keybinding: 'f11',
            when: 'inDebugMode'
        });
        keybindings.registerKeybinding({
            command: DebugCommands.STEP_OUT.id,
            keybinding: 'shift+f11',
            when: 'inDebugMode'
        });
        keybindings.registerKeybinding({
            command: DebugCommands.CONTINUE.id,
            keybinding: 'f5',
            when: 'inDebugMode'
        });
        keybindings.registerKeybinding({
            command: DebugCommands.PAUSE.id,
            keybinding: 'f6',
            when: 'inDebugMode'
        });

        keybindings.registerKeybinding({
            command: DebugCommands.TOGGLE_BREAKPOINT.id,
            keybinding: 'f9',
            when: 'editorTextFocus'
        });
        keybindings.registerKeybinding({
            command: DebugCommands.INLINE_BREAKPOINT.id,
            keybinding: 'shift+f9',
            when: 'editorTextFocus'
        });

        keybindings.registerKeybinding({
            command: DebugBreakpointWidgetCommands.ACCEPT.id,
            keybinding: 'enter',
            when: 'breakpointWidgetFocus && !suggestWidgetVisible'
        });
        keybindings.registerKeybinding({
            command: DebugBreakpointWidgetCommands.CLOSE.id,
            keybinding: 'esc',
            when: 'isBreakpointWidgetVisible || (breakpointWidgetFocus && !suggestWidgetVisible)'
        });
    }

    registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
        toolbar.registerItem({
            id: DebugCommands.ADD_FUNCTION_BREAKPOINT.id,
            command: DebugCommands.ADD_FUNCTION_BREAKPOINT.id,
            icon: codicon('add'),
            tooltip: DebugCommands.ADD_FUNCTION_BREAKPOINT.label
        });
        toolbar.registerItem({
            id: DebugCommands.ADD_DATA_BREAKPOINT.id,
            command: DebugCommands.ADD_DATA_BREAKPOINT.id,
            icon: codicon('variable-group'),
            tooltip: DebugCommands.ADD_DATA_BREAKPOINT.label,
            onDidChange: this.manager.onDidStopDebugSession as unknown as Event<void>
        });
        toolbar.registerItem({
            id: DebugCommands.TOGGLE_BREAKPOINTS_ENABLED.id,
            command: DebugCommands.TOGGLE_BREAKPOINTS_ENABLED.id,
            icon: codicon('activate-breakpoints'),
            priority: 1
        });
        toolbar.registerItem({
            id: DebugCommands.REMOVE_ALL_BREAKPOINTS.id,
            command: DebugCommands.REMOVE_ALL_BREAKPOINTS.id,
            icon: codicon('close-all'),
            priority: 2
        });

        toolbar.registerItem({
            id: DebugCommands.ADD_WATCH_EXPRESSION.id,
            command: DebugCommands.ADD_WATCH_EXPRESSION.id,
            icon: codicon('add'),
            tooltip: DebugCommands.ADD_WATCH_EXPRESSION.label
        });
        toolbar.registerItem({
            id: DebugCommands.COLLAPSE_ALL_WATCH_EXPRESSIONS.id,
            command: DebugCommands.COLLAPSE_ALL_WATCH_EXPRESSIONS.id,
            icon: codicon('collapse-all'),
            tooltip: DebugCommands.COLLAPSE_ALL_WATCH_EXPRESSIONS.label,
            priority: 1
        });
        toolbar.registerItem({
            id: DebugCommands.REMOVE_ALL_WATCH_EXPRESSIONS.id,
            command: DebugCommands.REMOVE_ALL_WATCH_EXPRESSIONS.id,
            icon: codicon('close-all'),
            tooltip: DebugCommands.REMOVE_ALL_WATCH_EXPRESSIONS.label,
            priority: 2
        });
    }

    protected async openSession(
        session: DebugSession,
        options?: {
            reveal?: boolean;
        }
    ): Promise<DebugWidget | DebugSessionWidget> {
        const { reveal } = {
            reveal: true,
            ...options
        };
        const debugWidget = await this.openView({ reveal });
        // Only switch to this session if it has a stopped thread
        // Don't switch to background sessions that are just starting up
        if (session.currentThread && session.currentThread.stopped) {
            debugWidget.sessionManager.currentSession = session;
        }
        return debugWidget['sessionWidget'];
    }

    protected revealSession(session: DebugSession): DebugSessionWidget | undefined {
        const widget = this.tryGetWidget()?.['sessionWidget'];
        if (widget) {
            this.shell.revealWidget(widget.id);
        }
        return widget;
    }

    async start(noDebug?: boolean, debugSessionOptions?: DebugSessionOptions): Promise<void> {
        let current = debugSessionOptions || this.configurations.current;
        // If no configurations are currently present, create the `launch.json` and prompt users to select the config.
        if (!current) {
            await this.configurations.addConfiguration();
            return;
        }

        if (noDebug !== undefined) {
            if (current.configuration) {
                current = {
                    ...current,
                    configuration: {
                        ...current.configuration,
                        noDebug
                    }
                };
            } else {
                current = {
                    ...current,
                    noDebug
                };
            }
        }

        await this.manager.start(current);
    }

    async runTo(uri: URI, line: number, column?: number): Promise<void> {
        const thread = this.manager.currentThread;
        if (!thread) {
            return;
        }
        const checkThread = () => {
            if (thread.stopped && thread === this.manager.currentThread) {
                return true;
            }
            console.warn('Cannot run to the specified location. The current thread has changed or is not stopped.');
            return false;
        };
        if (!checkThread()) {
            return;
        }
        const breakpoint = SourceBreakpoint.create(uri, { line, column });
        let shouldRemoveBreakpoint = this.breakpointManager.addBreakpoint(breakpoint);
        const removeBreakpoint = () => {
            const breakpoints = this.breakpointManager.getBreakpoints(uri);
            const newBreakpoints = breakpoints.filter(bp => bp.id !== breakpoint.id);
            if (breakpoints.length !== newBreakpoints.length) {
                this.breakpointManager.setBreakpoints(uri, newBreakpoints);
            }
        };
        try {
            const sessionBreakpoint = await this.verifyBreakpoint(breakpoint, thread.session);
            if (!checkThread()) {
                return;
            }
            if (!sessionBreakpoint || !sessionBreakpoint.installed || !sessionBreakpoint.verified) {
                this.messageService.warn(nls.localize('theia/debug/cannotRunToThisLocation',
                    'Could not run the current thread to the specified location.'
                ));
                return;
            }
            const rawBreakpoint = sessionBreakpoint.raw!; // an installed breakpoint always has the underlying raw breakpoint
            if (rawBreakpoint.line !== line || (column && rawBreakpoint.column !== column)) {
                const shouldRun = await new ConfirmDialog({
                    title: nls.localize('theia/debug/confirmRunToShiftedPosition_title',
                        'Cannot run the current thread to exactly the specified location'),
                    msg: nls.localize('theia/debug/confirmRunToShiftedPosition_msg',
                        'The target position will be shifted to Ln {0}, Col {1}. Run anyway?', rawBreakpoint.line, rawBreakpoint.column || 1),
                    ok: Dialog.YES,
                    cancel: Dialog.NO
                }).open();
                if (!shouldRun || !checkThread()) {
                    return;
                }
            }
            if (shouldRemoveBreakpoint) {
                Event.toPromise(Event.filter(
                    Event.any(this.manager.onDidStopDebugSession, this.manager.onDidDestroyDebugSession),
                    session => session === thread.session
                )).then(removeBreakpoint);
            }
            await thread.continue();
            shouldRemoveBreakpoint = false;
        } finally {
            if (shouldRemoveBreakpoint) {
                removeBreakpoint();
            }
        }
    }

    protected async verifyBreakpoint(breakpoint: SourceBreakpoint, session: DebugSession, timeout = 2000): Promise<DebugBreakpoint | undefined> {
        let sessionBreakpoint = session.getBreakpoint(breakpoint.id);
        if (!sessionBreakpoint || !sessionBreakpoint.installed || !sessionBreakpoint.verified) {
            try {
                await waitForEvent(Event.filter(session.onDidChangeBreakpoints, () => {
                    sessionBreakpoint = session.getBreakpoint(breakpoint.id);
                    return !!sessionBreakpoint && sessionBreakpoint.installed && sessionBreakpoint.verified;
                }), timeout); // wait up to `timeout` ms for the breakpoint to become installed and verified
            } catch (e) {
                if (!(e instanceof CancellationError)) { // ignore the `CancellationError` on timeout
                    throw e;
                }
            }
        }
        return sessionBreakpoint;
    }

    get threads(): DebugThreadsWidget | undefined {
        const { currentWidget } = this.shell;
        return currentWidget instanceof DebugThreadsWidget && currentWidget || undefined;
    }
    get selectedSession(): DebugSession | undefined {
        const { threads } = this;
        return threads && threads.selectedElement instanceof DebugSession && threads.selectedElement || undefined;
    }
    get selectedThread(): DebugThread | undefined {
        const { threads } = this;
        return threads && threads.selectedElement instanceof DebugThread && threads.selectedElement || undefined;
    }

    get frames(): DebugStackFramesWidget | undefined {
        const { currentWidget } = this.shell;
        return currentWidget instanceof DebugStackFramesWidget && currentWidget || undefined;
    }
    get selectedFrame(): DebugStackFrame | undefined {
        const { frames } = this;
        return frames && frames.selectedElement instanceof DebugStackFrame && frames.selectedElement || undefined;
    }

    get breakpoints(): DebugBreakpointsWidget | undefined {
        const { currentWidget } = this.shell;
        return currentWidget instanceof DebugBreakpointsWidget && currentWidget || undefined;
    }
    get selectedAnyBreakpoint(): DebugBreakpoint | undefined {
        const { breakpoints } = this;
        const selectedElement = breakpoints && breakpoints.selectedElement;
        return selectedElement instanceof DebugBreakpoint ? selectedElement : undefined;
    }
    get selectedBreakpoint(): DebugSourceBreakpoint | undefined {
        const breakpoint = this.selectedAnyBreakpoint;
        return breakpoint && breakpoint instanceof DebugSourceBreakpoint && !breakpoint.logMessage ? breakpoint : undefined;
    }
    get selectedBreakpoints(): DebugBreakpoint[] {
        const { breakpoints } = this;
        return breakpoints && breakpoints.model.selectedNodes
            .filter(TreeElementNode.is)
            .map(node => node.element)
            .filter(element => element instanceof DebugBreakpoint) as DebugBreakpoint[] || [];
    }
    get selectedLogpoint(): DebugSourceBreakpoint | undefined {
        const breakpoint = this.selectedAnyBreakpoint;
        return breakpoint && breakpoint instanceof DebugSourceBreakpoint && !!breakpoint.logMessage ? breakpoint : undefined;
    }
    get selectedFunctionBreakpoint(): DebugFunctionBreakpoint | undefined {
        const breakpoint = this.selectedAnyBreakpoint;
        return breakpoint && breakpoint instanceof DebugFunctionBreakpoint ? breakpoint : undefined;
    }
    get selectedInstructionBreakpoint(): DebugInstructionBreakpoint | undefined {
        if (this.selectedAnyBreakpoint instanceof DebugInstructionBreakpoint) {
            return this.selectedAnyBreakpoint;
        }
    }
    get selectedExceptionBreakpoint(): DebugExceptionBreakpoint | undefined {
        const { breakpoints } = this;
        const selectedElement = breakpoints && breakpoints.selectedElement;
        return selectedElement instanceof DebugExceptionBreakpoint ? selectedElement : undefined;
    }

    get selectedSettableBreakpoint(): DebugFunctionBreakpoint | DebugInstructionBreakpoint | DebugSourceBreakpoint | undefined {
        const selected = this.selectedAnyBreakpoint;
        if (selected instanceof DebugFunctionBreakpoint || selected instanceof DebugInstructionBreakpoint || selected instanceof DebugSourceBreakpoint) {
            return selected;
        }
    }

    get consoleWidget(): ConsoleWidget | undefined {
        const { currentWidget } = this.shell;
        return currentWidget instanceof ConsoleWidget && currentWidget.id === DebugConsoleContribution.options.id && currentWidget || undefined;
    }
    get variables(): DebugVariablesWidget | undefined {
        const { currentWidget } = this.shell;
        return currentWidget instanceof DebugVariablesWidget && currentWidget || undefined;
    }
    get variablesSource(): DebugHoverWidget | DebugVariablesWidget | ConsoleContentWidget | undefined {
        const hover = this.editors.model?.hover;
        if (hover?.isVisible) {
            return hover;
        }
        return this.variables ?? this.consoleWidget?.content;
    }
    get selectedVariable(): DebugVariable | undefined {
        const { variablesSource } = this;
        return variablesSource && variablesSource.selectedElement instanceof DebugVariable && variablesSource.selectedElement || undefined;
    }

    get watch(): DebugWatchWidget | undefined {
        const { currentWidget } = this.shell;
        return currentWidget instanceof DebugWatchWidget && currentWidget || undefined;
    }
    get watchExpression(): DebugWatchExpression | undefined {
        const { watch } = this;
        return watch && watch.selectedElement instanceof DebugWatchExpression && watch.selectedElement || undefined;
    }

    protected isPosition(position: unknown): position is monaco.IPosition {
        return monaco.Position.isIPosition(position);
    }

    protected asPosition(position: monaco.IPosition): monaco.Position {
        return monaco.Position.lift(position);
    }

    registerColors(colors: ColorRegistry): void {
        colors.register(
            // Debug colors should be aligned with https://code.visualstudio.com/api/references/theme-color#debug-colors
            {
                id: 'editor.stackFrameHighlightBackground',
                defaults: {
                    dark: '#ffff0033',
                    light: '#ffff6673',
                    hcDark: '#fff600',
                    hcLight: '#ffff6673'
                }, description: nls.localizeByDefault('Background color for the highlight of line at the top stack frame position.')
            },
            {
                id: 'editor.focusedStackFrameHighlightBackground',
                defaults: {
                    dark: '#7abd7a4d',
                    light: '#cee7ce73',
                    hcDark: '#cee7ce',
                    hcLight: '#cee7ce73'
                }, description: nls.localizeByDefault('Background color for the highlight of line at focused stack frame position.')
            },
            // Status bar colors should be aligned with debugging colors from https://code.visualstudio.com/api/references/theme-color#status-bar-colors
            {
                id: 'statusBar.debuggingBackground', defaults: {
                    dark: '#CC6633',
                    light: '#CC6633',
                    hcDark: '#CC6633',
                    hcLight: '#B5200D'
                }, description: nls.localizeByDefault('Status bar background color when a program is being debugged. The status bar is shown in the bottom of the window')
            },
            {
                id: 'statusBar.debuggingForeground', defaults: {
                    dark: 'statusBar.foreground',
                    light: 'statusBar.foreground',
                    hcDark: 'statusBar.foreground',
                    hcLight: 'statusBar.foreground'
                }, description: nls.localizeByDefault('Status bar foreground color when a program is being debugged. The status bar is shown in the bottom of the window')
            },
            {
                id: 'statusBar.debuggingBorder', defaults: {
                    dark: 'statusBar.border',
                    light: 'statusBar.border',
                    hcDark: 'statusBar.border',
                    hcLight: 'statusBar.border'
                }, description: nls.localizeByDefault(
                    'Status bar border color separating to the sidebar and editor when a program is being debugged. The status bar is shown in the bottom of the window')
            },
            // Debug Exception Widget colors should be aligned with
            // https://github.com/microsoft/vscode/blob/ff5f581425da6230b6f9216ecf19abf6c9d285a6/src/vs/workbench/contrib/debug/browser/exceptionWidget.ts#L23
            {
                id: 'debugExceptionWidget.border', defaults: {
                    dark: '#a31515',
                    light: '#a31515',
                    hcDark: '#a31515',
                    hcLight: '#a31515'
                }, description: nls.localizeByDefault('Exception widget border color.'),
            },
            {
                id: 'debugExceptionWidget.background', defaults: {
                    dark: '#420b0d',
                    light: '#f1dfde',
                    hcDark: '#420b0d',
                    hcLight: '#f1dfde'
                }, description: nls.localizeByDefault('Exception widget background color.')
            },
            // Debug Icon colors should be aligned with
            // https://code.visualstudio.com/api/references/theme-color#debug-icons-colors
            {
                id: 'debugIcon.breakpointForeground', defaults: {
                    dark: '#E51400',
                    light: '#E51400',
                    hcDark: '#E51400',
                    hcLight: '#E51400'
                },
                description: nls.localizeByDefault('Icon color for breakpoints.')
            },
            {
                id: 'debugIcon.breakpointDisabledForeground', defaults: {
                    dark: '#848484',
                    light: '#848484',
                    hcDark: '#848484',
                    hcLight: '#848484'
                },
                description: nls.localizeByDefault('Icon color for disabled breakpoints.')
            },
            {
                id: 'debugIcon.breakpointUnverifiedForeground', defaults: {
                    dark: '#848484',
                    light: '#848484',
                    hcDark: '#848484',
                    hcLight: '#848484'
                },
                description: nls.localizeByDefault('Icon color for unverified breakpoints.')
            },
            {
                id: 'debugIcon.breakpointCurrentStackframeForeground', defaults: {
                    dark: '#FFCC00',
                    light: '#BE8700',
                    hcDark: '#FFCC00',
                    hcLight: '#BE8700'
                },
                description: nls.localizeByDefault('Icon color for the current breakpoint stack frame.')
            },
            {
                id: 'debugIcon.breakpointStackframeForeground', defaults: {
                    dark: '#89D185',
                    light: '#89D185',
                    hcDark: '#89D185',
                    hcLight: '#89D185'
                },
                description: nls.localizeByDefault('Icon color for all breakpoint stack frames.')
            },
            {
                id: 'debugIcon.startForeground', defaults: {
                    dark: '#89D185',
                    light: '#388A34',
                    hcDark: '#89D185',
                    hcLight: '#388A34'
                }, description: nls.localizeByDefault('Debug toolbar icon for start debugging.')
            },
            {
                id: 'debugIcon.pauseForeground', defaults: {
                    dark: '#75BEFF',
                    light: '#007ACC',
                    hcDark: '#75BEFF',
                    hcLight: '#007ACC'
                }, description: nls.localizeByDefault('Debug toolbar icon for pause.')
            },
            {
                id: 'debugIcon.stopForeground', defaults: {
                    dark: '#F48771',
                    light: '#A1260D',
                    hcDark: '#F48771',
                    hcLight: '#A1260D'
                }, description: nls.localizeByDefault('Debug toolbar icon for stop.')
            },
            {
                id: 'debugIcon.disconnectForeground', defaults: {
                    dark: '#F48771',
                    light: '#A1260D',
                    hcDark: '#F48771',
                    hcLight: '#A1260D'
                }, description: nls.localizeByDefault('Debug toolbar icon for disconnect.')
            },
            {
                id: 'debugIcon.restartForeground', defaults: {
                    dark: '#89D185',
                    light: '#388A34',
                    hcDark: '#89D185',
                    hcLight: '#388A34'
                }, description: nls.localizeByDefault('Debug toolbar icon for restart.')
            },
            {
                id: 'debugIcon.stepOverForeground', defaults: {
                    dark: '#75BEFF',
                    light: '#007ACC',
                    hcDark: '#75BEFF',
                    hcLight: '#007ACC',
                }, description: nls.localizeByDefault('Debug toolbar icon for step over.')
            },
            {
                id: 'debugIcon.stepIntoForeground', defaults: {
                    dark: '#75BEFF',
                    light: '#007ACC',
                    hcDark: '#75BEFF',
                    hcLight: '#007ACC'
                }, description: nls.localizeByDefault('Debug toolbar icon for step into.')
            },
            {
                id: 'debugIcon.stepOutForeground', defaults: {
                    dark: '#75BEFF',
                    light: '#007ACC',
                    hcDark: '#75BEFF',
                    hcLight: '#007ACC',
                }, description: nls.localizeByDefault('Debug toolbar icon for step over.')
            },
            {
                id: 'debugIcon.continueForeground', defaults: {
                    dark: '#75BEFF',
                    light: '#007ACC',
                    hcDark: '#75BEFF',
                    hcLight: '#007ACC'
                }, description: nls.localizeByDefault('Debug toolbar icon for continue.')
            },
            {
                id: 'debugIcon.stepBackForeground', defaults: {
                    dark: '#75BEFF',
                    light: '#007ACC',
                    hcDark: '#75BEFF',
                    hcLight: '#007ACC'
                }, description: nls.localizeByDefault('Debug toolbar icon for step back.')
            },
            {
                id: 'debugConsole.infoForeground', defaults: {
                    dark: 'editorInfo.foreground',
                    light: 'editorInfo.foreground',
                    hcDark: 'foreground',
                    hcLight: 'foreground'
                }, description: 'Foreground color for info messages in debug REPL console.' // this description is present in VS Code, but is not currently localized there
            },
            {
                id: 'debugConsole.warningForeground', defaults: {
                    dark: 'editorWarning.foreground',
                    light: 'editorWarning.foreground',
                    hcDark: '#008000',
                    hcLight: 'editorWarning.foreground'
                },
                description: 'Foreground color for warning messages in debug REPL console.' // this description is present in VS Code, but is not currently localized there
            },
            {
                id: 'debugConsole.errorForeground', defaults: {
                    dark: 'errorForeground',
                    light: 'errorForeground',
                    hcDark: 'errorForeground',
                    hcLight: 'errorForeground'
                },
                description: 'Foreground color for error messages in debug REPL console.', // this description is present in VS Code, but is not currently localized there
            },
            {
                id: 'debugConsole.sourceForeground', defaults: {
                    dark: 'foreground',
                    light: 'foreground',
                    hcDark: 'foreground',
                    hcLight: 'foreground'
                },
                description: 'Foreground color for source filenames in debug REPL console.', // this description is present in VS Code, but is not currently localized there
            },
            {
                id: 'debugConsoleInputIcon.foreground', defaults: {
                    dark: 'foreground',
                    light: 'foreground',
                    hcDark: 'foreground',
                    hcLight: 'foreground'
                },
                description: 'Foreground color for debug console input marker icon.' // this description is present in VS Code, but is not currently localized there
            }
        );
    }

    protected updateStatusBar(): void {
        if (this.debuggingStatusBar === document.body.classList.contains('theia-mod-debugging')) {
            return;
        }
        document.body.classList.toggle('theia-mod-debugging');
    }

    protected get debuggingStatusBar(): boolean {
        if (this.manager.state < DebugState.Running) {
            return false;
        }

        const session = this.manager.currentSession;
        if (session) {
            if (session.configuration.noDebug) {
                return false;
            }
            if (this.getOption(session, 'suppressDebugStatusbar')) {
                return false;
            }
        }

        return true;
    }

    protected getOption(session: DebugSession | undefined, option: keyof {
        [Property in keyof DebugConfiguration]: boolean;
    }): boolean | undefined {
        // If session is undefined there will be no option
        if (!session) {
            return false;
        }
        // If undefined take the value of the parent
        if (option in session.configuration && session.configuration[option] !== undefined) {
            return session.configuration[option];
        }

        return this.getOption(session.parentSession, option);
    }
}
