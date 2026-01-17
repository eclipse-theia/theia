// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

/**
 * Function ID for creating a new task context (implementation plan).
 * Creates a task context with auto-generated metadata and opens it in the editor.
 */
export const CREATE_TASK_CONTEXT_FUNCTION_ID = 'createTaskContext';

/**
 * Function ID for reading the current task context.
 * Returns the content of the task context for the current session or a specified ID.
 */
export const GET_TASK_CONTEXT_FUNCTION_ID = 'getTaskContext';

/**
 * Function ID for editing a task context with string replacement.
 * Applies targeted edits to the task context and opens it in the editor.
 */
export const EDIT_TASK_CONTEXT_FUNCTION_ID = 'editTaskContext';

/**
 * Function ID for listing all task contexts for the current session.
 * Useful when the agent has created multiple plans and needs to see what exists.
 */
export const LIST_TASK_CONTEXTS_FUNCTION_ID = 'listTaskContexts';

/**
 * Function ID for completely rewriting a task context.
 * Fallback when edits fail repeatedly - replaces the entire content.
 */
export const REWRITE_TASK_CONTEXT_FUNCTION_ID = 'rewriteTaskContext';
