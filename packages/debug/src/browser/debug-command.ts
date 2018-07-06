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

import { injectable, inject } from "inversify";
import { CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from "@theia/core/lib/common";
import { MAIN_MENU_BAR, MenuPath } from "@theia/core/lib/common/menu";
import { DebugService } from "../common/debug-common";
import { DebugSessionManager } from "./debug-session";
import { DebugConfigurationManager } from "./debug-configuration";
import { DebugSelectionService } from "./view/debug-selection-service";
import { SingleTextInputDialog } from "@theia/core/lib/browser/dialogs";
import { DebugProtocol } from "vscode-debugprotocol";
import { BreakpointsDialog } from "./view/debug-breakpoints-widget";

export const DEBUG_SESSION_CONTEXT_MENU: MenuPath = ['debug-session-context-menu'];
export const DEBUG_SESSION_THREAD_CONTEXT_MENU: MenuPath = ['debug-session-thread-context-menu'];
export const DEBUG_VARIABLE_CONTEXT_MENU: MenuPath = ['debug-variable-context-menu'];

export namespace DebugSessionContextMenu {
    export const STOP = [...DEBUG_SESSION_CONTEXT_MENU, '1_stop'];
}

export namespace DebugThreadContextMenu {
    export const RESUME_THREAD = [...DEBUG_SESSION_THREAD_CONTEXT_MENU, '2_resume'];
    export const SUSPEND_THREAD = [...RESUME_THREAD, '1_suspend'];
}

export namespace DebugVariableContextMenu {
    export const MODIFY = [...DEBUG_VARIABLE_CONTEXT_MENU, '1_modify'];
}

export namespace DebugMenus {
    export const DEBUG = [...MAIN_MENU_BAR, "4_debug"];
    export const DEBUG_STOP = [...DEBUG, '2_stop'];
    export const DEBUG_START = [...DEBUG_STOP, '1_start'];
    export const SUSPEND_ALL_THREADS = [...DEBUG, '6_suspend_all_threads'];
    export const RESUME_ALL_THREADS = [...SUSPEND_ALL_THREADS, '5_resume_all_threads'];
    export const SHOW_BREAKPOINTS = [...DEBUG, '7_breakpoinst'];
    export const ADD_CONFIGURATION = [...DEBUG, '4_add_configuration'];
    export const OPEN_CONFIGURATION = [...ADD_CONFIGURATION, '3_open_configuration'];
}

export namespace DEBUG_COMMANDS {
    export const START = {
        id: 'debug.start',
        label: 'Start'
    };

    export const STOP = {
        id: 'debug.stop',
        label: 'Stop'
    };

    export const OPEN_CONFIGURATION = {
        id: 'debug.configuration.open',
        label: 'Open configuration'
    };

    export const ADD_CONFIGURATION = {
        id: 'debug.configuration.add',
        label: 'Add configuration'
    };

    export const SUSPEND_THREAD = {
        id: 'debug.thread.suspend',
        label: 'Suspend thread'
    };

    export const RESUME_THREAD = {
        id: 'debug.thread.resume',
        label: 'Resume thread'
    };
    export const SUSPEND_ALL_THREADS = {
        id: 'debug.thread.suspend.all',
        label: 'Suspend'
    };

    export const RESUME_ALL_THREADS = {
        id: 'debug.thread.resume.all',
        label: 'Resume'
    };

    export const MODIFY_VARIABLE = {
        id: 'debug.variable.modify',
        label: 'Modify'
    };

    export const SHOW_BREAKPOINTS = {
        id: 'debug.breakpoints.show',
        label: 'Breakpoints'
    };
}

@injectable()
export class DebugCommandHandlers implements MenuContribution, CommandContribution {
    constructor(
        @inject(DebugService) protected readonly debug: DebugService,
        @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager,
        @inject(DebugConfigurationManager) protected readonly debugConfigurationManager: DebugConfigurationManager,
        @inject(DebugSelectionService) protected readonly debugSelectionHandler: DebugSelectionService,
        @inject(BreakpointsDialog) protected readonly breakpointsDialog: BreakpointsDialog) { }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerSubmenu(DebugMenus.DEBUG, 'Debug');
        menus.registerMenuAction(DebugMenus.DEBUG_START, {
            commandId: DEBUG_COMMANDS.START.id
        });
        menus.registerMenuAction(DebugMenus.DEBUG_STOP, {
            commandId: DEBUG_COMMANDS.STOP.id
        });
        menus.registerMenuAction(DebugMenus.OPEN_CONFIGURATION, {
            commandId: DEBUG_COMMANDS.OPEN_CONFIGURATION.id
        });
        menus.registerMenuAction(DebugMenus.ADD_CONFIGURATION, {
            commandId: DEBUG_COMMANDS.ADD_CONFIGURATION.id
        });
        menus.registerMenuAction(DebugSessionContextMenu.STOP, {
            commandId: DEBUG_COMMANDS.STOP.id
        });
        menus.registerMenuAction(DebugMenus.SUSPEND_ALL_THREADS, {
            commandId: DEBUG_COMMANDS.SUSPEND_ALL_THREADS.id
        });
        menus.registerMenuAction(DebugMenus.RESUME_ALL_THREADS, {
            commandId: DEBUG_COMMANDS.RESUME_ALL_THREADS.id
        });
        menus.registerMenuAction(DebugMenus.SHOW_BREAKPOINTS, {
            commandId: DEBUG_COMMANDS.SHOW_BREAKPOINTS.id
        });
        menus.registerMenuAction(DebugThreadContextMenu.SUSPEND_THREAD, {
            commandId: DEBUG_COMMANDS.SUSPEND_THREAD.id
        });
        menus.registerMenuAction(DebugThreadContextMenu.RESUME_THREAD, {
            commandId: DEBUG_COMMANDS.RESUME_THREAD.id
        });
        menus.registerMenuAction(DebugVariableContextMenu.MODIFY, {
            commandId: DEBUG_COMMANDS.MODIFY_VARIABLE.id
        });
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(DEBUG_COMMANDS.START);
        registry.registerHandler(DEBUG_COMMANDS.START.id, {
            execute: () => {
                this.debugConfigurationManager.selectConfiguration()
                    .then(configuration => this.debug.resolveDebugConfiguration(configuration))
                    .then(configuration => this.debug.start(configuration).then(sessionId => ({ sessionId, configuration })))
                    .then(({ sessionId, configuration }) => this.debugSessionManager.create(sessionId, configuration))
                    .catch(error => console.log(error));
            },
            isEnabled: () => true,
            isVisible: () => true
        });

        registry.registerCommand(DEBUG_COMMANDS.STOP);
        registry.registerHandler(DEBUG_COMMANDS.STOP.id, {
            execute: () => {
                const debugSession = this.debugSessionManager.getActiveDebugSession();
                if (debugSession) {
                    debugSession.disconnect();
                }
            },
            isEnabled: () => this.debugSessionManager.getActiveDebugSession() !== undefined,
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

        registry.registerCommand(DEBUG_COMMANDS.SUSPEND_THREAD);
        registry.registerHandler(DEBUG_COMMANDS.SUSPEND_THREAD.id, {
            execute: () => {
                const debugSession = this.debugSessionManager.getActiveDebugSession();
                if (debugSession) {
                    const selection = this.debugSelectionHandler.get(debugSession.sessionId);
                    if (!!selection && !!selection.thread) {
                        debugSession.pause({ threadId: selection.thread.id });
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
                return !!selection && !!selection.thread && !!debugSession.state.stoppedThreadIds.has(selection.thread.id);
            }
        });

        registry.registerCommand(DEBUG_COMMANDS.RESUME_THREAD);
        registry.registerHandler(DEBUG_COMMANDS.RESUME_THREAD.id, {
            execute: () => {
                const debugSession = this.debugSessionManager.getActiveDebugSession();
                if (debugSession) {
                    const selection = this.debugSelectionHandler.get(debugSession.sessionId);
                    if (!!selection && !!selection.thread) {
                        debugSession.resume({ threadId: selection.thread.id });
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
                return !!selection && !!selection.thread && !debugSession.state.stoppedThreadIds.has(selection.thread.id);
            }
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
                            const args: DebugProtocol.SetVariableArguments = {
                                variablesReference: variable.parentVariablesReference,
                                name: variable.name,
                                value: newValue
                            };
                            debugSession.setVariable(args);
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
}
