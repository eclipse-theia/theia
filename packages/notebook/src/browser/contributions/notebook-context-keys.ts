// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';

export type NotebookCellExecutionStateContext = 'idle' | 'pending' | 'executing' | 'succeeded' | 'failed';

/**
 * Context Keys for the Notebook Editor as defined by vscode in https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/notebook/common/notebookContextKeys.ts
 */
export const HAS_OPENED_NOTEBOOK = 'userHasOpenedNotebook';
export const KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED = 'notebookFindWidgetFocused';
export const NOTEBOOK_EDITOR_FOCUSED = 'notebookEditorFocused';
export const NOTEBOOK_CELL_LIST_FOCUSED = 'notebookCellListFocused';
export const NOTEBOOK_OUTPUT_FOCUSED = 'notebookOutputFocused';
export const NOTEBOOK_OUTPUT_INPUT_FOCUSED = 'notebookOutputInputFocused';
export const NOTEBOOK_EDITOR_EDITABLE = 'notebookEditable';
export const NOTEBOOK_HAS_RUNNING_CELL = 'notebookHasRunningCell';
export const NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON = 'notebookUseConsolidatedOutputButton';
export const NOTEBOOK_BREAKPOINT_MARGIN_ACTIVE = 'notebookBreakpointMargin';
export const NOTEBOOK_CELL_TOOLBAR_LOCATION = 'notebookCellToolbarLocation';
export const NOTEBOOK_CURSOR_NAVIGATION_MODE = 'notebookCursorNavigationMode';
export const NOTEBOOK_LAST_CELL_FAILED = 'notebookLastCellFailed';
export const NOTEBOOK_VIEW_TYPE = 'notebookType';
export const NOTEBOOK_CELL_TYPE = 'notebookCellType';
export const NOTEBOOK_CELL_EDITABLE = 'notebookCellEditable';
export const NOTEBOOK_CELL_FOCUSED = 'notebookCellFocused';
export const NOTEBOOK_CELL_EDITOR_FOCUSED = 'notebookCellEditorFocused';
export const NOTEBOOK_CELL_MARKDOWN_EDIT_MODE = 'notebookCellMarkdownEditMode';
export const NOTEBOOK_CELL_LINE_NUMBERS = 'notebookCellLineNumbers';
export const NOTEBOOK_CELL_EXECUTION_STATE = 'notebookCellExecutionState';
export const NOTEBOOK_CELL_EXECUTING = 'notebookCellExecuting';
export const NOTEBOOK_CELL_HAS_OUTPUTS = 'notebookCellHasOutputs';
export const NOTEBOOK_CELL_INPUT_COLLAPSED = 'notebookCellInputIsCollapsed';
export const NOTEBOOK_CELL_OUTPUT_COLLAPSED = 'notebookCellOutputIsCollapsed';
export const NOTEBOOK_CELL_RESOURCE = 'notebookCellResource';
export const NOTEBOOK_KERNEL = 'notebookKernel';
export const NOTEBOOK_KERNEL_COUNT = 'notebookKernelCount';
export const NOTEBOOK_KERNEL_SOURCE_COUNT = 'notebookKernelSourceCount';
export const NOTEBOOK_KERNEL_SELECTED = 'notebookKernelSelected';
export const NOTEBOOK_INTERRUPTIBLE_KERNEL = 'notebookInterruptibleKernel';
export const NOTEBOOK_MISSING_KERNEL_EXTENSION = 'notebookMissingKernelExtension';
export const NOTEBOOK_HAS_OUTPUTS = 'notebookHasOutputs';

export const NOTEBOOK_CELL_CURSOR_FIRST_LINE = 'cellEditorCursorPositionFirstLine';
export const NOTEBOOK_CELL_CURSOR_LAST_LINE = 'cellEditorCursorPositionLastLine';

export namespace NotebookContextKeys {
    export function initNotebookContextKeys(service: ContextKeyService): void {
        service.createKey(HAS_OPENED_NOTEBOOK, false);
        service.createKey(KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED, false);

        // // Is Notebook
        // export const NOTEBOOK_IS_ACTIVE_EDITOR = ContextKeyExpr.equals('activeEditor', NOTEBOOK_EDITOR_ID);
        // export const INTERACTIVE_WINDOW_IS_ACTIVE_EDITOR = ContextKeyExpr.equals('activeEditor', INTERACTIVE_WINDOW_EDITOR_ID);

        // Editor keys
        service.createKey(NOTEBOOK_EDITOR_FOCUSED, false);
        service.createKey(NOTEBOOK_CELL_LIST_FOCUSED, false);
        service.createKey(NOTEBOOK_OUTPUT_FOCUSED, false);
        service.createKey(NOTEBOOK_OUTPUT_INPUT_FOCUSED, false);
        service.createKey(NOTEBOOK_EDITOR_EDITABLE, true);
        service.createKey(NOTEBOOK_HAS_RUNNING_CELL, false);
        service.createKey(NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON, false);
        service.createKey(NOTEBOOK_BREAKPOINT_MARGIN_ACTIVE, false);
        service.createKey(NOTEBOOK_CELL_TOOLBAR_LOCATION, 'left');
        service.createKey(NOTEBOOK_CURSOR_NAVIGATION_MODE, false);
        service.createKey(NOTEBOOK_LAST_CELL_FAILED, false);

        // Cell keys
        service.createKey(NOTEBOOK_VIEW_TYPE, undefined);
        service.createKey(NOTEBOOK_CELL_TYPE, undefined);
        service.createKey(NOTEBOOK_CELL_EDITABLE, false);
        service.createKey(NOTEBOOK_CELL_FOCUSED, false);
        service.createKey(NOTEBOOK_CELL_EDITOR_FOCUSED, false);
        service.createKey(NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, false);
        service.createKey(NOTEBOOK_CELL_LINE_NUMBERS, 'inherit');
        service.createKey(NOTEBOOK_CELL_EXECUTION_STATE, undefined);
        service.createKey(NOTEBOOK_CELL_EXECUTING, false);
        service.createKey(NOTEBOOK_CELL_HAS_OUTPUTS, false);
        service.createKey(NOTEBOOK_CELL_INPUT_COLLAPSED, false);
        service.createKey(NOTEBOOK_CELL_OUTPUT_COLLAPSED, false);
        service.createKey(NOTEBOOK_CELL_RESOURCE, '');
        service.createKey(NOTEBOOK_CELL_CURSOR_FIRST_LINE, false);
        service.createKey(NOTEBOOK_CELL_CURSOR_LAST_LINE, false);

        // Kernels
        service.createKey(NOTEBOOK_KERNEL, undefined);
        service.createKey(NOTEBOOK_KERNEL_COUNT, 0);
        service.createKey(NOTEBOOK_KERNEL_SOURCE_COUNT, 0);
        service.createKey(NOTEBOOK_KERNEL_SELECTED, false);
        service.createKey(NOTEBOOK_INTERRUPTIBLE_KERNEL, false);
        service.createKey(NOTEBOOK_MISSING_KERNEL_EXTENSION, false);
        service.createKey(NOTEBOOK_HAS_OUTPUTS, false);
    }
}
