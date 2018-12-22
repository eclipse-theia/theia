/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { AbstractViewContribution, ApplicationShell, KeybindingRegistry } from '@theia/core/lib/browser';
import { injectable, inject } from 'inversify';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { MenuModelRegistry, CommandRegistry, MAIN_MENU_BAR, Command } from '@theia/core/lib/common';
import { DebugViewLocation } from '../common/debug-configuration';
import { EditorKeybindingContexts } from '@theia/editor/lib/browser';
import { DebugSessionManager } from './debug-session-manager';
import { DebugWidget } from './view/debug-widget';
import { BreakpointManager } from './breakpoint/breakpoint-manager';
import { DebugConfigurationManager } from './debug-configuration-manager';
import { DebugState, DebugSession } from './debug-session';
import { DebugBreakpointsWidget } from './view/debug-breakpoints-widget';
import { DebugBreakpoint } from './model/debug-breakpoint';
import { DebugThreadsWidget } from './view/debug-threads-widget';
import { DebugThread } from './model/debug-thread';
import { DebugStackFramesWidget } from './view/debug-stack-frames-widget';
import { DebugStackFrame } from './model/debug-stack-frame';
import { DebugVariablesWidget } from './view/debug-variables-widget';
import { DebugVariable } from './console/debug-console-items';
import { DebugSessionWidget, DebugSessionWidgetFactory } from './view/debug-session-widget';
import { DebugKeybindingContexts } from './debug-keybinding-contexts';
import { DebugEditorModel } from './editor/debug-editor-model';
import { DebugEditorService } from './editor/debug-editor-service';
import { DebugConsoleContribution } from './console/debug-console-contribution';
import { DebugService } from '../common/debug-service';
import { DebugSchemaUpdater } from './debug-schema-updater';

export namespace DebugMenus {
    export const DEBUG = [...MAIN_MENU_BAR, '6_debug'];
    export const DEBUG_CONTROLS = [...DEBUG, 'a_controls'];
    export const DEBUG_CONFIGURATION = [...DEBUG, 'b_configuration'];
    export const DEBUG_THREADS = [...DEBUG, 'c_threads'];
    export const DEBUG_SESSIONS = [...DEBUG, 'd_sessions'];
    export const DEBUG_BREAKPOINTS = [...DEBUG, 'e_breakpoints'];
}

export namespace DebugCommands {

    const DEBUG_CATEGORY = 'Debug';

    export const START: Command = {
        id: 'debug.start',
        category: DEBUG_CATEGORY,
        label: 'Start Debugging',
        iconClass: 'fa fa-play'
    };
    export const START_NO_DEBUG: Command = {
        id: 'debug.start.noDebug',
        label: 'Debug: Start Without Debugging'
    };
    export const STOP: Command = {
        id: 'debug.stop',
        category: DEBUG_CATEGORY,
        label: 'Stop Debugging',
        iconClass: 'fa fa-stop'
    };
    export const RESTART: Command = {
        id: 'debug.restart',
        category: DEBUG_CATEGORY,
        label: 'Restart Debugging',
    };

    export const OPEN_CONFIGURATIONS = {
        id: 'debug.configurations.open',
        label: 'Debug: Open Configurations'
    };
    export const ADD_CONFIGURATION = {
        id: 'debug.configurations.add',
        label: 'Debug: Add Configuration...'
    };

    export const STEP_OVER: Command = {
        id: 'debug.thread.next',
        category: DEBUG_CATEGORY,
        label: 'Step Over',
        iconClass: 'fa fa-arrow-right'
    };
    export const STEP_INTO: Command = {
        id: 'debug.thread.stepin',
        category: DEBUG_CATEGORY,
        label: 'Step Into',
        iconClass: 'fa fa-arrow-down'
    };
    export const STEP_OUT: Command = {
        id: 'debug.thread.stepout',
        category: DEBUG_CATEGORY,
        label: 'Step Out',
        iconClass: 'fa fa-arrow-up'
    };
    export const CONTINUE: Command = {
        id: 'debug.thread.continue',
        category: DEBUG_CATEGORY,
        label: 'Continue',
        iconClass: 'fa fa-play-circle'
    };
    export const PAUSE: Command = {
        id: 'debug.thread.pause',
        category: DEBUG_CATEGORY,
        label: 'Pause',
        iconClass: 'fa fa-pause'
    };
    export const CONTINUE_ALL: Command = {
        id: 'debug.thread.continue.all',
        category: DEBUG_CATEGORY,
        label: 'Continue All',
        iconClass: 'fa fa-play-circle'
    };
    export const PAUSE_ALL: Command = {
        id: 'debug.thread.pause.all',
        category: DEBUG_CATEGORY,
        label: 'Pause All',
        iconClass: 'fa fa-pause'
    };

    export const TOGGLE_BREAKPOINT: Command = {
        id: 'debug.breakpoint.toggle',
        category: DEBUG_CATEGORY,
        label: 'Toggle Breakpoint',
    };
    export const ENABLE_ALL_BREAKPOINTS: Command = {
        id: 'debug.breakpoint.enableAll',
        category: DEBUG_CATEGORY,
        label: 'Enable All Breakpoints',
    };
    export const DISABLE_ALL_BREAKPOINTS: Command = {
        id: 'debug.breakpoint.disableAll',
        category: DEBUG_CATEGORY,
        label: 'Disable All Breakpoints',
    };
    export const REMOVE_BREAKPOINT: Command = {
        id: 'debug.breakpoint.remove',
        category: DEBUG_CATEGORY,
        label: 'Remove Breakpoint',
    };
    export const REMOVE_ALL_BREAKPOINTS: Command = {
        id: 'debug.breakpoint.removeAll',
        category: DEBUG_CATEGORY,
        label: 'Remove All Breakpoints',
    };
    export const SHOW_HOVER = {
        id: 'debug.editor.showHover',
        label: 'Debug: Show Hover'
    };

    export const RESTART_FRAME: Command = {
        id: 'debug.frame.restart',
        category: DEBUG_CATEGORY,
        label: 'Restart Frame',
    };
    export const COPY_CALL_STACK: Command = {
        id: 'debug.callStack.copy',
        category: DEBUG_CATEGORY,
        label: 'Copy Call Stack',
    };

    export const SET_VARIABLE_VALUE: Command = {
        id: 'debug.variable.setValue',
        category: DEBUG_CATEGORY,
        label: 'Set Value',
    };
    export const COPY_VAIRABLE_VALUE: Command = {
        id: 'debug.variable.copyValue',
        category: DEBUG_CATEGORY,
        label: 'Copy Value',
    };
    export const COPY_VAIRABLE_AS_EXPRESSION: Command = {
        id: 'debug.variable.copyAsExpression',
        category: DEBUG_CATEGORY,
        label: 'Copy As Expression',
    };
}
export namespace DebugThreadContextCommands {
    export const STEP_OVER = {
        id: 'debug.thread.context.context.next'
    };
    export const STEP_INTO = {
        id: 'debug.thread.context.stepin'
    };
    export const STEP_OUT = {
        id: 'debug.thread.context.stepout'
    };
    export const CONTINUE = {
        id: 'debug.thread.context.continue'
    };
    export const PAUSE = {
        id: 'debug.thread.context.pause'
    };
    export const TERMINATE = {
        id: 'debug.thread.context.terminate'
    };
}
export namespace DebugSessionContextCommands {
    export const STOP = {
        id: 'debug.session.context.stop'
    };
    export const RESTART = {
        id: 'debug.session.context.restart'
    };
    export const PAUSE_ALL = {
        id: 'debug.session.context.pauseAll'
    };
    export const CONTINUE_ALL = {
        id: 'debug.session.context.continueAll'
    };
    export const REVEAL = {
        id: 'debug.session.context.reveal'
    };
    export const OPEN_LEFT = {
        id: 'debug.session.context.openLeft'
    };
    export const OPEN_RIGHT = {
        id: 'debug.session.context.openRight'
    };
    export const OPEN_BOTTOM = {
        id: 'debug.session.context.openBottom'
    };
}
export namespace DebugEditorContextCommands {
    export const ADD_BREAKPOINT = {
        id: 'debug.editor.context.addBreakpoint'
    };
    export const REMOVE_BREAKPOINT = {
        id: 'debug.editor.context.removeBreakpoint'
    };
    export const ENABLE_BREAKPOINT = {
        id: 'debug.editor.context.enableBreakpoint'
    };
    export const DISABLE_BREAKPOINT = {
        id: 'debug.editor.context.disableBreakpoint'
    };
}

const darkCss = require('../../src/browser/style/debug-dark.useable.css');
const lightCss = require('../../src/browser/style/debug-bright.useable.css');

function updateTheme(): void {
    const theme = ThemeService.get().getCurrentTheme().id;
    if (theme === 'dark') {
        lightCss.unuse();
        darkCss.use();
    } else if (theme === 'light') {
        darkCss.unuse();
        lightCss.use();
    }
}
updateTheme();
ThemeService.get().onThemeChange(() => updateTheme());

@injectable()
export class DebugFrontendApplicationContribution extends AbstractViewContribution<DebugWidget> {

    @inject(DebugService)
    protected readonly debug: DebugService;

    @inject(DebugSessionManager)
    protected readonly manager: DebugSessionManager;

    @inject(DebugConfigurationManager)
    protected readonly configurations: DebugConfigurationManager;

    @inject(BreakpointManager)
    protected readonly breakpointManager: BreakpointManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(DebugSessionWidgetFactory)
    protected readonly sessionWidgetFactory: DebugSessionWidgetFactory;

    @inject(DebugEditorService)
    protected readonly editors: DebugEditorService;

    @inject(DebugConsoleContribution)
    protected readonly console: DebugConsoleContribution;

    @inject(DebugSchemaUpdater)
    protected readonly schemaUpdater: DebugSchemaUpdater;

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
        ((async () => {
            const supported = await this.configurations.supported;
            if (supported.next().value) {
                await this.openView();
            }
        })());
    }

    protected firstSessionStart = true;
    async onStart(): Promise<void> {
        this.manager.onDidCreateDebugSession(session => this.openSession(session, { reveal: false }));
        this.manager.onDidStartDebugSession(session => {
            const { noDebug, openDebug, internalConsoleOptions } = session.configuration;
            if (internalConsoleOptions === 'openOnSessionStart' ||
                (internalConsoleOptions === 'openOnFirstSessionStart' && this.firstSessionStart)) {
                this.console.openView({
                    reveal: true
                });
            }
            if (!noDebug && (openDebug === 'openOnSessionStart' || (openDebug === 'openOnFirstSessionStart' && this.firstSessionStart))) {
                this.openSession(session);
            }
            this.firstSessionStart = false;
        });
        this.manager.onDidStopDebugSession(session => {
            const { openDebug } = session.configuration;
            if (openDebug === 'openOnDebugBreak') {
                this.openSession(session);
            }
        });

        this.schemaUpdater.update();
        this.configurations.load();
        await this.breakpointManager.load();
    }

    onStop(): void {
        this.configurations.save();
        this.breakpointManager.save();
    }

    registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        const registerMenuActions = (menuPath: string[], ...commands: Command[]) => {
            for (const [index, command] of commands.entries()) {
                menus.registerMenuAction(menuPath, {
                    commandId: command.id,
                    label: command.label && command.label.startsWith('Debug: ') && command.label.slice('Debug: '.length) || command.label,
                    icon: command.iconClass,
                    order: String.fromCharCode('a'.charCodeAt(0) + index)
                });
            }
        };

        menus.registerSubmenu(DebugMenus.DEBUG, 'Debug');
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
        registerMenuActions(DebugMenus.DEBUG_BREAKPOINTS,
            DebugCommands.TOGGLE_BREAKPOINT,
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
            { ...DebugCommands.RESTART, ...DebugSessionContextCommands.RESTART, label: 'Restart' },
            { ...DebugCommands.STOP, ...DebugSessionContextCommands.STOP, label: 'Stop' },
            { ...DebugThreadContextCommands.TERMINATE, label: 'Terminate Thread' }
        );
        registerMenuActions(DebugThreadsWidget.OPEN_MENU,
            { ...DebugSessionContextCommands.REVEAL, label: 'Reveal' },
            { ...DebugSessionContextCommands.OPEN_LEFT, label: 'Open Left' },
            { ...DebugSessionContextCommands.OPEN_RIGHT, label: 'Open Right' },
            { ...DebugSessionContextCommands.OPEN_BOTTOM, label: 'Open Bottom' }
        );

        registerMenuActions(DebugStackFramesWidget.CONTEXT_MENU,
            DebugCommands.RESTART_FRAME,
            DebugCommands.COPY_CALL_STACK
        );

        registerMenuActions(DebugVariablesWidget.CONTEXT_MENU,
            DebugCommands.SET_VARIABLE_VALUE,
            DebugCommands.COPY_VAIRABLE_VALUE,
            DebugCommands.COPY_VAIRABLE_AS_EXPRESSION
        );

        registerMenuActions(DebugBreakpointsWidget.REMOVE_MENU,
            DebugCommands.REMOVE_BREAKPOINT,
            DebugCommands.REMOVE_ALL_BREAKPOINTS
        );
        registerMenuActions(DebugBreakpointsWidget.ENABLE_MENU,
            DebugCommands.ENABLE_ALL_BREAKPOINTS,
            DebugCommands.DISABLE_ALL_BREAKPOINTS
        );

        registerMenuActions(DebugEditorModel.CONTEXT_MENU,
            { ...DebugEditorContextCommands.ADD_BREAKPOINT, label: 'Add Breakpoint' },
            { ...DebugEditorContextCommands.REMOVE_BREAKPOINT, label: 'Remove Breakpoint' },
            { ...DebugEditorContextCommands.ENABLE_BREAKPOINT, label: 'Enable Breakpoint' },
            { ...DebugEditorContextCommands.DISABLE_BREAKPOINT, label: 'Disable Breakpoint' }
        );
    }

    registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        registry.registerCommand(DebugCommands.START, {
            execute: () => this.start()
        });
        registry.registerCommand(DebugCommands.START_NO_DEBUG, {
            execute: () => this.start(true)
        });
        registry.registerCommand(DebugCommands.STOP, {
            execute: () => this.manager.currentSession && this.manager.currentSession.terminate(),
            isEnabled: () => this.manager.state !== DebugState.Inactive
        });
        registry.registerCommand(DebugCommands.RESTART, {
            execute: () => this.manager.restart(),
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
            execute: () => this.manager.currentThread && this.manager.currentThread.continue(),
            isEnabled: () => this.manager.state === DebugState.Stopped
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
            execute: () => this.selectedSession && this.selectedSession.terminate(),
            isEnabled: () => !!this.selectedSession && this.selectedSession.state !== DebugState.Inactive,
            isVisible: () => !this.selectedThread
        });
        registry.registerCommand(DebugSessionContextCommands.RESTART, {
            execute: () => this.selectedSession && this.manager.restart(this.selectedSession),
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
            isEnabled: () => this.hasSessionWidget,
            isVisible: () => !this.selectedThread && this.hasSessionWidget
        });
        registry.registerCommand(DebugSessionContextCommands.OPEN_LEFT, {
            execute: () => this.selectedSession && this.openSession(this.selectedSession, {
                debugViewLocation: 'left'
            }),
            isEnabled: () => !this.hasSessionWidget,
            isVisible: () => !this.selectedThread && !this.hasSessionWidget
        });
        registry.registerCommand(DebugSessionContextCommands.OPEN_RIGHT, {
            execute: () => this.selectedSession && this.openSession(this.selectedSession, {
                debugViewLocation: 'right'
            }),
            isEnabled: () => !this.hasSessionWidget,
            isVisible: () => !this.selectedThread && !this.hasSessionWidget
        });
        registry.registerCommand(DebugSessionContextCommands.OPEN_BOTTOM, {
            execute: () => this.selectedSession && this.openSession(this.selectedSession, {
                debugViewLocation: 'bottom'
            }),
            isEnabled: () => !this.hasSessionWidget,
            isVisible: () => !this.selectedThread && !this.hasSessionWidget
        });

        registry.registerCommand(DebugCommands.TOGGLE_BREAKPOINT, {
            execute: () => this.editors.toggleBreakpoint(),
            isEnabled: () => !!this.editors.model
        });
        registry.registerCommand(DebugCommands.ENABLE_ALL_BREAKPOINTS, {
            execute: () => this.breakpointManager.enableAllBreakpoints(true),
            isEnabled: () => !!this.breakpointManager.getUris().next().value
        });
        registry.registerCommand(DebugCommands.DISABLE_ALL_BREAKPOINTS, {
            execute: () => this.breakpointManager.enableAllBreakpoints(false),
            isEnabled: () => !!this.breakpointManager.getUris().next().value
        });
        registry.registerCommand(DebugCommands.REMOVE_BREAKPOINT, {
            execute: () => {
                const { selectedBreakpoint } = this;
                if (selectedBreakpoint) {
                    selectedBreakpoint.remove();
                }
            },
            isEnabled: () => !!this.selectedBreakpoint
        });
        registry.registerCommand(DebugCommands.REMOVE_ALL_BREAKPOINTS, {
            execute: () => this.breakpointManager.cleanAllMarkers(),
            isEnabled: () => !!this.breakpointManager.getUris().next().value
        });
        registry.registerCommand(DebugCommands.SHOW_HOVER, {
            execute: () => this.editors.showHover(),
            isEnabled: () => this.editors.canShowHover()
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
            isEnabled: () => !!this.selectedVariable && this.selectedVariable.supportSetVariable,
            isVisible: () => !!this.selectedVariable && this.selectedVariable.supportSetVariable
        });
        registry.registerCommand(DebugCommands.COPY_VAIRABLE_VALUE, {
            execute: () => this.selectedVariable && this.selectedVariable.copyValue(),
            isEnabled: () => !!this.selectedVariable && this.selectedVariable.supportCopyValue,
            isVisible: () => !!this.selectedVariable && this.selectedVariable.supportCopyValue
        });
        registry.registerCommand(DebugCommands.COPY_VAIRABLE_AS_EXPRESSION, {
            execute: () => this.selectedVariable && this.selectedVariable.copyAsExpression(),
            isEnabled: () => !!this.selectedVariable && this.selectedVariable.supportCopyAsExpression,
            isVisible: () => !!this.selectedVariable && this.selectedVariable.supportCopyAsExpression
        });

        registry.registerCommand(DebugEditorContextCommands.ADD_BREAKPOINT, {
            execute: () => this.editors.toggleBreakpoint(),
            isEnabled: () => !this.editors.breakpoint,
            isVisible: () => !this.editors.breakpoint
        });
        registry.registerCommand(DebugEditorContextCommands.REMOVE_BREAKPOINT, {
            execute: () => this.editors.toggleBreakpoint(),
            isEnabled: () => !!this.editors.breakpoint,
            isVisible: () => !!this.editors.breakpoint
        });
        registry.registerCommand(DebugEditorContextCommands.ENABLE_BREAKPOINT, {
            execute: () => this.editors.setBreakpointEnabled(true),
            isEnabled: () => this.editors.breakpointEnabled === false,
            isVisible: () => this.editors.breakpointEnabled === false
        });
        registry.registerCommand(DebugEditorContextCommands.DISABLE_BREAKPOINT, {
            execute: () => this.editors.setBreakpointEnabled(false),
            isEnabled: () => !!this.editors.breakpointEnabled,
            isVisible: () => !!this.editors.breakpointEnabled
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        super.registerKeybindings(keybindings);
        keybindings.registerKeybinding({
            command: DebugCommands.START.id,
            keybinding: 'f5'
        });
        keybindings.registerKeybinding({
            command: DebugCommands.START_NO_DEBUG.id,
            keybinding: 'ctrl+f5'
        });
        keybindings.registerKeybinding({
            command: DebugCommands.STOP.id,
            keybinding: 'shift+f5',
            context: DebugKeybindingContexts.inDebugMode
        });

        keybindings.registerKeybinding({
            command: DebugCommands.RESTART.id,
            keybinding: 'shift+ctrlcmd+f5',
            context: DebugKeybindingContexts.inDebugMode
        });
        keybindings.registerKeybinding({
            command: DebugCommands.STEP_OVER.id,
            keybinding: 'f10',
            context: DebugKeybindingContexts.inDebugMode
        });
        keybindings.registerKeybinding({
            command: DebugCommands.STEP_INTO.id,
            keybinding: 'f11',
            context: DebugKeybindingContexts.inDebugMode
        });
        keybindings.registerKeybinding({
            command: DebugCommands.STEP_OUT.id,
            keybinding: 'shift+f11',
            context: DebugKeybindingContexts.inDebugMode
        });
        keybindings.registerKeybinding({
            command: DebugCommands.CONTINUE.id,
            keybinding: 'f5',
            context: DebugKeybindingContexts.inDebugMode
        });
        keybindings.registerKeybinding({
            command: DebugCommands.PAUSE.id,
            keybinding: 'f6',
            context: DebugKeybindingContexts.inDebugMode
        });

        keybindings.registerKeybinding({
            command: DebugCommands.TOGGLE_BREAKPOINT.id,
            keybinding: 'f9',
            context: EditorKeybindingContexts.editorTextFocus
        });
    }

    protected readonly sessionWidgets = new Map<string, DebugSessionWidget>();
    get hasSessionWidget(): boolean {
        return !!this.selectedSession && this.sessionWidgets.has(this.selectedSession.label);
    }
    protected async openSession(
        session: DebugSession,
        options?: {
            debugViewLocation?: DebugViewLocation
            reveal?: boolean
        }
    ): Promise<DebugWidget | DebugSessionWidget> {
        const { debugViewLocation, reveal } = {
            debugViewLocation: session.configuration.debugViewLocation,
            reveal: true,
            ...options
        };
        const sessionWidget = this.revealSession(session);
        if (sessionWidget) {
            return sessionWidget;
        }
        const area = ApplicationShell.isSideArea(debugViewLocation) ? debugViewLocation : 'debug';
        if (area === 'debug') {
            return this.openView({ reveal });
        }
        const newSessionWidget = this.sessionWidgetFactory({ session });
        this.sessionWidgets.set(session.label, newSessionWidget);
        newSessionWidget.disposed.connect(() =>
            this.sessionWidgets.delete(session.label)
        );
        this.shell.addWidget(newSessionWidget, { area });
        if (reveal) {
            this.shell.revealWidget(newSessionWidget.id);
        }
        return newSessionWidget;
    }
    protected revealSession(session: DebugSession): DebugSessionWidget | undefined {
        const widget = this.sessionWidgets.get(session.label);
        if (widget) {
            this.shell.revealWidget(widget.id);
        }
        return widget;
    }

    async start(noDebug?: boolean): Promise<void> {
        let { current } = this.configurations;
        if (current) {
            if (noDebug !== undefined) {
                current = {
                    ...current,
                    configuration: {
                        ...current.configuration,
                        noDebug
                    }
                };
            }
            await this.manager.start(current);
        }
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
    get selectedBreakpoint(): DebugBreakpoint | undefined {
        const { breakpoints } = this;
        return breakpoints && breakpoints.selectedElement instanceof DebugBreakpoint && breakpoints.selectedElement || undefined;
    }

    get variables(): DebugVariablesWidget | undefined {
        const { currentWidget } = this.shell;
        return currentWidget instanceof DebugVariablesWidget && currentWidget || undefined;
    }
    get selectedVariable(): DebugVariable | undefined {
        const { variables } = this;
        return variables && variables.selectedElement instanceof DebugVariable && variables.selectedElement || undefined;
    }

}
