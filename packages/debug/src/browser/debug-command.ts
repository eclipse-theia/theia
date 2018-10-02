/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject } from 'inversify';
import { CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core/lib/common';
import { MAIN_MENU_BAR, MenuPath } from '@theia/core/lib/common/menu';
import { DebugService } from '../common/debug-common';
import { DebugSessionManager } from './debug-session';
import { DebugConfigurationManager } from './debug-configuration';
import { DebugSelectionService } from './view/debug-selection-service';
import { SingleTextInputDialog } from '@theia/core/lib/browser/dialogs';
import { DebugProtocol } from 'vscode-debugprotocol';
import { BreakpointsDialog } from './view/debug-breakpoints-widget';

export const DEBUG_SESSION_CONTEXT_MENU: MenuPath = ['debug-session-context-menu'];
export const DEBUG_SESSION_THREAD_CONTEXT_MENU: MenuPath = ['debug-session-thread-context-menu'];
export const DEBUG_VARIABLE_CONTEXT_MENU: MenuPath = ['debug-variable-context-menu'];

export namespace DebugSessionContextMenu {
    export const DEBUG_CONTROLS = [...DEBUG_SESSION_CONTEXT_MENU, '1_controls'];
}

export namespace DebugThreadContextMenu {
    export const DEBUG_PLAYER = [...DEBUG_SESSION_THREAD_CONTEXT_MENU, '2_player'];
    export const DEBUG_STEPPING = [...DEBUG_SESSION_THREAD_CONTEXT_MENU, '3_stepping'];
}

export namespace DebugVariableContextMenu {
    export const DEBUG_EDITION = [...DEBUG_VARIABLE_CONTEXT_MENU, '1_edition'];
}

export namespace DebugMenus {
    export const DEBUG = [...MAIN_MENU_BAR, '4_debug'];
    export const DEBUG_CONTROLS = [...DEBUG, '1_controls'];
    export const DEBUG_THREADS = [...DEBUG, '2_threads'];
    export const DEBUG_STEPPING = [...DEBUG, '3_stepping'];
    export const DEBUG_CONFIGURATION = [...DEBUG, '4_configuration'];
}

export namespace DEBUG_COMMANDS {
    export const START = {
        id: 'debug.start',
        label: 'Start',
        iconClass: 'fa fa-play'
    };

    export const STOP = {
        id: 'debug.stop',
        label: 'Stop',
        iconClass: 'fa fa-stop'
    };

    export const OPEN_CONFIGURATION = {
        id: 'debug.configuration.open',
        label: 'Open Configuration'
    };

    export const ADD_CONFIGURATION = {
        id: 'debug.configuration.add',
        label: 'Add Configuration'
    };

    export const SUSPEND_THREAD = {
        id: 'debug.thread.suspend',
        label: 'Suspend Thread'
    };

    export const RESUME_THREAD = {
        id: 'debug.thread.resume',
        label: 'Resume Thread'
    };
    export const SUSPEND_ALL_THREADS = {
        id: 'debug.thread.suspend.all',
        label: 'Suspend',
        iconClass: 'fa fa-pause'
    };

    export const RESUME_ALL_THREADS = {
        id: 'debug.thread.resume.all',
        label: 'Resume',
        iconClass: 'fa fa-play-circle'
    };

    export const MODIFY_VARIABLE = {
        id: 'debug.variable.modify',
        label: 'Modify'
    };

    export const SHOW_BREAKPOINTS = {
        id: 'debug.breakpoints.show',
        label: 'Breakpoints'
    };

    export const STEP = {
        id: 'debug.thread.next',
        label: 'Step',
        iconClass: 'fa fa-arrow-right'
    };

    export const STEPIN = {
        id: 'debug.thread.stepin',
        label: 'Step In',
        iconClass: 'fa fa-arrow-down'
    };

    export const STEPOUT = {
        id: 'debug.thread.stepout',
        label: 'Step Out',
        iconClass: 'fa fa-arrow-left'
    };
}

@injectable()
export class DebugCommandHandlers implements MenuContribution, CommandContribution {
    constructor(
        @inject(DebugService) protected readonly debug: DebugService,
        @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager,
        @inject(DebugConfigurationManager) protected readonly debugConfigurationManager: DebugConfigurationManager,
        @inject(DebugSelectionService) protected readonly debugSelectionHandler: DebugSelectionService,
        @inject(BreakpointsDialog) protected readonly breakpointsDialog: BreakpointsDialog
    ) { }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerSubmenu(DebugMenus.DEBUG, 'Debug');

        menus.registerMenuAction(DebugMenus.DEBUG_CONTROLS, {
            commandId: DEBUG_COMMANDS.START.id,
            order: '1_start',
        });
        menus.registerMenuAction(DebugMenus.DEBUG_CONTROLS, {
            commandId: DEBUG_COMMANDS.STOP.id,
            order: '2_stop',
        });

        menus.registerMenuAction(DebugMenus.DEBUG_THREADS, {
            commandId: DEBUG_COMMANDS.RESUME_ALL_THREADS.id,
            order: '3_resume_all_threads',
        });
        menus.registerMenuAction(DebugMenus.DEBUG_THREADS, {
            commandId: DEBUG_COMMANDS.SUSPEND_ALL_THREADS.id,
            order: '4_suspend_all_threads',
        });

        menus.registerMenuAction(DebugMenus.DEBUG_STEPPING, {
            commandId: DEBUG_COMMANDS.STEP.id,
            order: '5_next',
        });
        menus.registerMenuAction(DebugMenus.DEBUG_STEPPING, {
            commandId: DEBUG_COMMANDS.STEPIN.id,
            order: '6_stepin',
        });
        menus.registerMenuAction(DebugMenus.DEBUG_STEPPING, {
            commandId: DEBUG_COMMANDS.STEPOUT.id,
            order: '7_stepout',
        });

        menus.registerMenuAction(DebugMenus.DEBUG_CONFIGURATION, {
            commandId: DEBUG_COMMANDS.OPEN_CONFIGURATION.id,
            order: '8_open_configuration',
        });
        menus.registerMenuAction(DebugMenus.DEBUG_CONFIGURATION, {
            commandId: DEBUG_COMMANDS.ADD_CONFIGURATION.id,
            order: '9_add_configuration',
        });
        menus.registerMenuAction(DebugMenus.DEBUG_CONFIGURATION, {
            commandId: DEBUG_COMMANDS.SHOW_BREAKPOINTS.id,
            order: '10_breakpoints',
        });

        // debug session context
        menus.registerMenuAction(DebugSessionContextMenu.DEBUG_CONTROLS, {
            commandId: DEBUG_COMMANDS.STOP.id,
            order: '1_stop',
        });

        // thread context
        menus.registerMenuAction(DebugThreadContextMenu.DEBUG_PLAYER, {
            commandId: DEBUG_COMMANDS.SUSPEND_THREAD.id,
            order: '1_suspend',
        });
        menus.registerMenuAction(DebugThreadContextMenu.DEBUG_PLAYER, {
            commandId: DEBUG_COMMANDS.RESUME_THREAD.id,
            order: '2_resume',
        });
        menus.registerMenuAction(DebugThreadContextMenu.DEBUG_STEPPING, {
            commandId: DEBUG_COMMANDS.STEP.id,
            order: '3_next',
        });
        menus.registerMenuAction(DebugThreadContextMenu.DEBUG_STEPPING, {
            commandId: DEBUG_COMMANDS.STEPIN.id,
            order: '4_stepin',
        });
        menus.registerMenuAction(DebugThreadContextMenu.DEBUG_STEPPING, {
            commandId: DEBUG_COMMANDS.STEPOUT.id,
            order: '5_stepout',
        });

        // variable context
        menus.registerMenuAction(DebugVariableContextMenu.DEBUG_EDITION, {
            commandId: DEBUG_COMMANDS.MODIFY_VARIABLE.id,
            order: '1_modify',
        });
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(DEBUG_COMMANDS.START, {
            execute: () => this.start()
        });

        registry.registerCommand(DEBUG_COMMANDS.STOP);
        registry.registerHandler(DEBUG_COMMANDS.STOP.id, {
            execute: () => {
                const debugSession = this.debugSessionManager.getActiveDebugSession();
                if (debugSession) {
                    debugSession.disconnect();
                }
            },
            isEnabled: () => {
                const debugSession = this.debugSessionManager.getActiveDebugSession();
                return !!debugSession && debugSession.state.isConnected;
            },
            isVisible: () => true
        });

        registry.registerCommand(DEBUG_COMMANDS.OPEN_CONFIGURATION);
        registry.registerHandler(DEBUG_COMMANDS.OPEN_CONFIGURATION.id, {
            execute: () => this.debugConfigurationManager.openConfigurationFile(),
            isEnabled: () => true,
            isVisible: () => true
        });

        registry.registerCommand(DEBUG_COMMANDS.ADD_CONFIGURATION);
        registry.registerHandler(DEBUG_COMMANDS.ADD_CONFIGURATION.id, {
            execute: () => this.debugConfigurationManager.addConfiguration(),
            isEnabled: () => true,
            isVisible: () => true
        });

        registry.registerCommand(DEBUG_COMMANDS.SHOW_BREAKPOINTS);
        registry.registerHandler(DEBUG_COMMANDS.SHOW_BREAKPOINTS.id, {
            execute: () => this.breakpointsDialog.open(),
            isEnabled: () => true,
            isVisible: () => true
        });

        registry.registerCommand(DEBUG_COMMANDS.SUSPEND_ALL_THREADS);
        registry.registerHandler(DEBUG_COMMANDS.RESUME_ALL_THREADS.id, {
            execute: () => {
                const debugSession = this.debugSessionManager.getActiveDebugSession();
                if (debugSession) {
                    debugSession.resumeAll();
                }
            },
            isEnabled: () => {
                const debugSession = this.debugSessionManager.getActiveDebugSession();
                if (!debugSession) {
                    return false;
                }

                const state = debugSession.state;
                return !!state.isConnected && !state.allThreadsContinued;
            },
            isVisible: () => true
        });

        registry.registerCommand(DEBUG_COMMANDS.RESUME_ALL_THREADS);
        registry.registerHandler(DEBUG_COMMANDS.SUSPEND_ALL_THREADS.id, {
            execute: () => {
                const debugSession = this.debugSessionManager.getActiveDebugSession();
                if (debugSession) {
                    debugSession.pauseAll();
                }
            },
            isEnabled: () => {
                const debugSession = this.debugSessionManager.getActiveDebugSession();
                if (!debugSession) {
                    return false;
                }

                const state = debugSession.state;
                return !!state.isConnected && !state.allThreadsStopped;
            },
            isVisible: () => true
        });

        registry.registerCommand(DEBUG_COMMANDS.STEP);
        registry.registerHandler(DEBUG_COMMANDS.STEP.id, {
            execute: () => {
                const debugSession = this.debugSessionManager.getActiveDebugSession();
                if (debugSession) {
                    const threadId = this.getSelectedThreadId(debugSession.sessionId);
                    if (threadId) {
                        debugSession.next({ threadId });
                    }
                }
            },
            isEnabled: () => this.isSelectedThreadSuspended(),
            isVisible: () => true
        });

        registry.registerCommand(DEBUG_COMMANDS.STEPIN);
        registry.registerHandler(DEBUG_COMMANDS.STEPIN.id, {
            execute: () => {
                const debugSession = this.debugSessionManager.getActiveDebugSession();
                if (debugSession) {
                    const threadId = this.getSelectedThreadId(debugSession.sessionId);
                    if (threadId) {
                        debugSession.stepIn({ threadId });
                    }
                }
            },
            isEnabled: () => this.isSelectedThreadSuspended(),
            isVisible: () => true
        });

        registry.registerCommand(DEBUG_COMMANDS.STEPOUT);
        registry.registerHandler(DEBUG_COMMANDS.STEPOUT.id, {
            execute: () => {
                const debugSession = this.debugSessionManager.getActiveDebugSession();
                if (debugSession) {
                    const threadId = this.getSelectedThreadId(debugSession.sessionId);
                    if (threadId) {
                        debugSession.stepOut({ threadId });
                    }
                }
            },
            isEnabled: () => this.isSelectedThreadSuspended(),
            isVisible: () => true
        });

        registry.registerCommand(DEBUG_COMMANDS.SUSPEND_THREAD);
        registry.registerHandler(DEBUG_COMMANDS.SUSPEND_THREAD.id, {
            execute: () => {
                const debugSession = this.debugSessionManager.getActiveDebugSession();
                if (debugSession) {
                    const threadId = this.getSelectedThreadId(debugSession.sessionId);
                    if (threadId) {
                        debugSession.pause({ threadId });
                    }
                }
            },
            isEnabled: () => true,
            isVisible: () => this.isSelectedThreadResumed()
        });

        registry.registerCommand(DEBUG_COMMANDS.RESUME_THREAD);
        registry.registerHandler(DEBUG_COMMANDS.RESUME_THREAD.id, {
            execute: () => {
                const debugSession = this.debugSessionManager.getActiveDebugSession();
                if (debugSession) {
                    const threadId = this.getSelectedThreadId(debugSession.sessionId);
                    if (threadId) {
                        debugSession.resume({ threadId });
                    }
                }
            },
            isEnabled: () => true,
            isVisible: () => this.isSelectedThreadSuspended()
        });

        registry.registerCommand(DEBUG_COMMANDS.MODIFY_VARIABLE);
        registry.registerHandler(DEBUG_COMMANDS.MODIFY_VARIABLE.id, {
            execute: () => {
                const debugSession = this.debugSessionManager.getActiveDebugSession();
                if (debugSession) {
                    const selection = this.debugSelectionHandler.get(debugSession.sessionId);
                    if (selection.variable) {
                        const variable = selection.variable;
                        const dialog = new SingleTextInputDialog({
                            title: `Modify: ${variable.name}`,
                            initialValue: variable.value
                        });

                        dialog.open().then(newValue => {
                            if (newValue) {
                                const args: DebugProtocol.SetVariableArguments = {
                                    variablesReference: variable.parentVariablesReference,
                                    name: variable.name,
                                    value: newValue
                                };
                                debugSession.setVariable(args);
                            }
                        });
                    }
                }
            },
            isEnabled: () => true,
            isVisible: () => {
                const debugSession = this.debugSessionManager.getActiveDebugSession();
                if (!debugSession) {
                    return false;
                }

                const selection = this.debugSelectionHandler.get(debugSession.sessionId);
                return !!selection && !!selection.variable;
            }
        });
    }

    async start(): Promise<void> {
        const configuration = await this.debugConfigurationManager.selectConfiguration();
        if (!configuration) {
            return;
        }
        const session = await this.debug.create(configuration);
        await this.debugSessionManager.create(session, configuration);
    }

    private isSelectedThreadSuspended(): boolean {
        const debugSession = this.debugSessionManager.getActiveDebugSession();
        if (!debugSession) {
            return false;
        }

        const selection = this.debugSelectionHandler.get(debugSession.sessionId);
        return !!selection && !!selection.thread && !!debugSession.state.stoppedThreadIds.has(selection.thread.id);
    }

    private isSelectedThreadResumed(): boolean {
        const debugSession = this.debugSessionManager.getActiveDebugSession();
        if (!debugSession) {
            return false;
        }

        const selection = this.debugSelectionHandler.get(debugSession.sessionId);
        return !!selection && !!selection.thread && !debugSession.state.stoppedThreadIds.has(selection.thread.id);
    }

    private getSelectedThreadId(sessionId: string): number | undefined {
        const selection = this.debugSelectionHandler.get(sessionId);
        if (!!selection && !!selection.thread) {
            return selection.thread.id;
        }
    }
}
