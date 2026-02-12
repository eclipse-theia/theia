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

import { Command, MAIN_MENU_BAR } from '@theia/core/lib/common';
import { codicon } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';

export namespace DebugMenus {
    export const DEBUG = [...MAIN_MENU_BAR, '6_debug'];
    export const DEBUG_CONTROLS = [...DEBUG, 'a_controls'];
    export const DEBUG_CONFIGURATION = [...DEBUG, 'b_configuration'];
    export const DEBUG_THREADS = [...DEBUG, 'c_threads'];
    export const DEBUG_SESSIONS = [...DEBUG, 'd_sessions'];
    export const DEBUG_BREAKPOINT = [...DEBUG, 'e_breakpoint'];
    export const DEBUG_NEW_BREAKPOINT = [...DEBUG_BREAKPOINT, 'a_new_breakpoint'];
    export const DEBUG_BREAKPOINTS = [...DEBUG, 'f_breakpoints'];
}

function nlsEditBreakpoint(breakpoint: string): string {
    return nls.localizeByDefault('Edit {0}...', nls.localizeByDefault(breakpoint));
}

function nlsRemoveBreakpoint(breakpoint: string): string {
    return nls.localizeByDefault('Remove {0}', nls.localizeByDefault(breakpoint));
}

export function nlsEnableBreakpoint(breakpoint: string): string {
    return nls.localizeByDefault('Enable {0}', nls.localizeByDefault(breakpoint));
}

export function nlsDisableBreakpoint(breakpoint: string): string {
    return nls.localizeByDefault('Disable {0}', nls.localizeByDefault(breakpoint));
}

export namespace DebugCommands {

    export const DEBUG_CATEGORY = 'Debug';
    export const DEBUG_CATEGORY_KEY = nls.getDefaultKey(DEBUG_CATEGORY);

    export const START = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.debug.start',
        category: DEBUG_CATEGORY,
        label: 'Start Debugging',
        iconClass: codicon('debug-alt')
    });
    export const START_NO_DEBUG = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.debug.run',
        category: DEBUG_CATEGORY,
        label: 'Start Without Debugging'
    });
    export const STOP = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.debug.stop',
        category: DEBUG_CATEGORY,
        label: 'Stop',
        iconClass: codicon('debug-stop')
    });
    export const RESTART = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.debug.restart',
        category: DEBUG_CATEGORY,
        label: 'Restart',
        iconClass: codicon('debug-restart')
    });

    export const OPEN_CONFIGURATIONS = Command.toDefaultLocalizedCommand({
        id: 'debug.configurations.open',
        category: DEBUG_CATEGORY,
        label: 'Open Configurations'
    });
    export const ADD_CONFIGURATION = Command.toDefaultLocalizedCommand({
        id: 'debug.configurations.add',
        category: DEBUG_CATEGORY,
        label: 'Add Configuration...'
    });

    export const STEP_OVER = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.debug.stepOver',
        category: DEBUG_CATEGORY,
        label: 'Step Over',
        iconClass: codicon('debug-step-over')
    });
    export const STEP_INTO = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.debug.stepInto',
        category: DEBUG_CATEGORY,
        label: 'Step Into',
        iconClass: codicon('debug-step-into')
    });
    export const STEP_OUT = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.debug.stepOut',
        category: DEBUG_CATEGORY,
        label: 'Step Out',
        iconClass: codicon('debug-step-out')
    });
    export const CONTINUE = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.debug.continue',
        category: DEBUG_CATEGORY,
        label: 'Continue',
        iconClass: codicon('debug-continue')
    });
    export const PAUSE = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.debug.pause',
        category: DEBUG_CATEGORY,
        label: 'Pause',
        iconClass: codicon('debug-pause')
    });
    export const CONTINUE_ALL = Command.toLocalizedCommand({
        id: 'debug.thread.continue.all',
        category: DEBUG_CATEGORY,
        label: 'Continue All',
        iconClass: codicon('debug-continue')
    }, 'theia/debug/continueAll', DEBUG_CATEGORY_KEY);
    export const PAUSE_ALL = Command.toLocalizedCommand({
        id: 'debug.thread.pause.all',
        category: DEBUG_CATEGORY,
        label: 'Pause All',
        iconClass: codicon('debug-pause')
    }, 'theia/debug/pauseAll', DEBUG_CATEGORY_KEY);

    export const TOGGLE_BREAKPOINT = Command.toDefaultLocalizedCommand({
        id: 'editor.debug.action.toggleBreakpoint',
        category: DEBUG_CATEGORY,
        label: 'Toggle Breakpoint',
    });
    export const INLINE_BREAKPOINT = Command.toDefaultLocalizedCommand({
        id: 'editor.debug.action.inlineBreakpoint',
        category: DEBUG_CATEGORY,
        label: 'Inline Breakpoint',
    });
    export const ADD_CONDITIONAL_BREAKPOINT = Command.toDefaultLocalizedCommand({
        id: 'debug.breakpoint.add.conditional',
        category: DEBUG_CATEGORY,
        label: 'Add Conditional Breakpoint...',
    });
    export const ADD_LOGPOINT = Command.toDefaultLocalizedCommand({
        id: 'debug.breakpoint.add.logpoint',
        category: DEBUG_CATEGORY,
        label: 'Add Logpoint...',
    });
    export const ADD_FUNCTION_BREAKPOINT = Command.toDefaultLocalizedCommand({
        id: 'debug.breakpoint.add.function',
        category: DEBUG_CATEGORY,
        label: 'Add Function Breakpoint',
    });
    export const ADD_DATA_BREAKPOINT = Command.toDefaultLocalizedCommand({
        id: 'debug.breakpoint.add.data',
        category: DEBUG_CATEGORY,
        label: 'Add Data Breakpoint at Address'
    });
    export const ENABLE_SELECTED_BREAKPOINTS = Command.toLocalizedCommand({
        id: 'debug.breakpoint.enableSelected',
        category: DEBUG_CATEGORY,
        label: 'Enable Selected Breakpoints',
    }, 'theia/debug/enableSelectedBreakpoints', DEBUG_CATEGORY_KEY);
    export const ENABLE_ALL_BREAKPOINTS = Command.toDefaultLocalizedCommand({
        id: 'debug.breakpoint.enableAll',
        category: DEBUG_CATEGORY,
        label: 'Enable All Breakpoints',
    });
    export const DISABLE_SELECTED_BREAKPOINTS = Command.toLocalizedCommand({
        id: 'debug.breakpoint.disableSelected',
        category: DEBUG_CATEGORY,
        label: 'Disable Selected Breakpoints',
    }, 'theia/debug/disableSelectedBreakpoints', DEBUG_CATEGORY_KEY);
    export const DISABLE_ALL_BREAKPOINTS = Command.toDefaultLocalizedCommand({
        id: 'debug.breakpoint.disableAll',
        category: DEBUG_CATEGORY,
        label: 'Disable All Breakpoints',
    });
    export const EDIT_BREAKPOINT = Command.toLocalizedCommand({
        id: 'debug.breakpoint.edit',
        category: DEBUG_CATEGORY,
        originalLabel: 'Edit Breakpoint...',
        label: nlsEditBreakpoint('Breakpoint')
    }, '', DEBUG_CATEGORY_KEY);
    export const EDIT_LOGPOINT = Command.toLocalizedCommand({
        id: 'debug.logpoint.edit',
        category: DEBUG_CATEGORY,
        originalLabel: 'Edit Logpoint...',
        label: nlsEditBreakpoint('Logpoint')
    }, '', DEBUG_CATEGORY_KEY);
    export const EDIT_BREAKPOINT_CONDITION = Command.toLocalizedCommand({
        id: 'debug.breakpoint.editCondition',
        category: DEBUG_CATEGORY,
        label: 'Edit Condition...'
    }, '', DEBUG_CATEGORY_KEY);
    export const REMOVE_BREAKPOINT = Command.toLocalizedCommand({
        id: 'debug.breakpoint.remove',
        category: DEBUG_CATEGORY,
        originalLabel: 'Remove Breakpoint',
        label: nlsRemoveBreakpoint('Breakpoint')
    }, '', DEBUG_CATEGORY_KEY);
    export const REMOVE_LOGPOINT = Command.toLocalizedCommand({
        id: 'debug.logpoint.remove',
        category: DEBUG_CATEGORY,
        originalLabel: 'Remove Logpoint',
        label: nlsRemoveBreakpoint('Logpoint')
    }, '', DEBUG_CATEGORY_KEY);
    export const REMOVE_SELECTED_BREAKPOINTS = Command.toLocalizedCommand({
        id: 'debug.breakpoint.removeSelected',
        category: DEBUG_CATEGORY,
        label: 'Remove Selected Breakpoints',
    }, '', DEBUG_CATEGORY_KEY);
    export const REMOVE_ALL_BREAKPOINTS = Command.toDefaultLocalizedCommand({
        id: 'debug.breakpoint.removeAll',
        category: DEBUG_CATEGORY,
        label: 'Remove All Breakpoints',
    });
    export const TOGGLE_BREAKPOINTS_ENABLED = Command.toLocalizedCommand({
        id: 'debug.breakpoint.toggleEnabled',
        label: 'Toggle Enable Breakpoints',
    });
    export const SHOW_HOVER = Command.toDefaultLocalizedCommand({
        id: 'editor.debug.action.showDebugHover',
        label: 'Debug: Show Hover'
    });
    export const EVALUATE_IN_DEBUG_CONSOLE = Command.toDefaultLocalizedCommand({
        id: 'editor.debug.action.selectionToRepl',
        category: DEBUG_CATEGORY,
        label: 'Evaluate in Debug Console'
    });
    export const ADD_TO_WATCH = Command.toDefaultLocalizedCommand({
        id: 'editor.debug.action.selectionToWatch',
        category: DEBUG_CATEGORY,
        label: 'Add to Watch'
    });
    export const JUMP_TO_CURSOR = Command.toDefaultLocalizedCommand({
        id: 'editor.debug.action.jumpToCursor',
        category: DEBUG_CATEGORY,
        label: 'Jump to Cursor'
    });
    export const RUN_TO_CURSOR = Command.toDefaultLocalizedCommand({
        id: 'editor.debug.action.runToCursor',
        category: DEBUG_CATEGORY,
        label: 'Run to Cursor'
    });
    export const RUN_TO_LINE = Command.toDefaultLocalizedCommand({
        id: 'editor.debug.action.runToLine',
        category: DEBUG_CATEGORY,
        label: 'Run to Line'
    });

    export const RESTART_FRAME = Command.toDefaultLocalizedCommand({
        id: 'debug.frame.restart',
        category: DEBUG_CATEGORY,
        label: 'Restart Frame',
    });
    export const COPY_CALL_STACK = Command.toDefaultLocalizedCommand({
        id: 'debug.callStack.copy',
        category: DEBUG_CATEGORY,
        label: 'Copy Call Stack',
    });

    export const SET_VARIABLE_VALUE = Command.toDefaultLocalizedCommand({
        id: 'debug.variable.setValue',
        category: DEBUG_CATEGORY,
        label: 'Set Value',
    });
    export const COPY_VARIABLE_VALUE = Command.toDefaultLocalizedCommand({
        id: 'debug.variable.copyValue',
        category: DEBUG_CATEGORY,
        label: 'Copy Value',
    });
    export const COPY_VARIABLE_AS_EXPRESSION = Command.toDefaultLocalizedCommand({
        id: 'debug.variable.copyAsExpression',
        category: DEBUG_CATEGORY,
        label: 'Copy as Expression',
    });
    export const WATCH_VARIABLE = Command.toDefaultLocalizedCommand({
        id: 'debug.variable.watch',
        category: DEBUG_CATEGORY,
        label: 'Add to Watch',
    });

    export const ADD_WATCH_EXPRESSION = Command.toDefaultLocalizedCommand({
        id: 'debug.watch.addExpression',
        category: DEBUG_CATEGORY,
        label: 'Add Expression'
    });
    export const EDIT_WATCH_EXPRESSION = Command.toDefaultLocalizedCommand({
        id: 'debug.watch.editExpression',
        category: DEBUG_CATEGORY,
        label: 'Edit Expression'
    });
    export const COPY_WATCH_EXPRESSION_VALUE = Command.toLocalizedCommand({
        id: 'debug.watch.copyExpressionValue',
        category: DEBUG_CATEGORY,
        label: 'Copy Expression Value'
    }, 'theia/debug/copyExpressionValue', DEBUG_CATEGORY_KEY);
    export const REMOVE_WATCH_EXPRESSION = Command.toDefaultLocalizedCommand({
        id: 'debug.watch.removeExpression',
        category: DEBUG_CATEGORY,
        label: 'Remove Expression'
    });
    export const COLLAPSE_ALL_WATCH_EXPRESSIONS = Command.toDefaultLocalizedCommand({
        id: 'debug.watch.collapseAllExpressions',
        category: DEBUG_CATEGORY,
        label: 'Collapse All'
    });
    export const REMOVE_ALL_WATCH_EXPRESSIONS = Command.toDefaultLocalizedCommand({
        id: 'debug.watch.removeAllExpressions',
        category: DEBUG_CATEGORY,
        label: 'Remove All Expressions'
    });
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
}
export namespace DebugEditorContextCommands {
    export const ADD_BREAKPOINT = {
        id: 'debug.editor.context.addBreakpoint'
    };
    export const ADD_CONDITIONAL_BREAKPOINT = {
        id: 'debug.editor.context.addBreakpoint.conditional'
    };
    export const ADD_LOGPOINT = {
        id: 'debug.editor.context.add.logpoint'
    };
    export const REMOVE_BREAKPOINT = {
        id: 'debug.editor.context.removeBreakpoint'
    };
    export const EDIT_BREAKPOINT = {
        id: 'debug.editor.context.edit.breakpoint'
    };
    export const ENABLE_BREAKPOINT = {
        id: 'debug.editor.context.enableBreakpoint'
    };
    export const DISABLE_BREAKPOINT = {
        id: 'debug.editor.context.disableBreakpoint'
    };
    export const REMOVE_LOGPOINT = {
        id: 'debug.editor.context.logpoint.remove'
    };
    export const EDIT_LOGPOINT = {
        id: 'debug.editor.context.logpoint.edit'
    };
    export const ENABLE_LOGPOINT = {
        id: 'debug.editor.context.logpoint.enable'
    };
    export const DISABLE_LOGPOINT = {
        id: 'debug.editor.context.logpoint.disable'
    };
    export const JUMP_TO_CURSOR = {
        id: 'debug.editor.context.jumpToCursor'
    };
    export const RUN_TO_LINE = {
        id: 'debug.editor.context.runToLine'
    };
}
export namespace DebugBreakpointWidgetCommands {
    export const ACCEPT = {
        id: 'debug.breakpointWidget.accept'
    };
    export const CLOSE = {
        id: 'debug.breakpointWidget.close'
    };
}
