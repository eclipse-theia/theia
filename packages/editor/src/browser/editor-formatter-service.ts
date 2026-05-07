// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { Event, PreferenceScope } from '@theia/core';
import { TextEditor } from './editor';

export const FormatterService = Symbol('FormatterService');

export interface FormatterInfo {
    id: string;
    displayName: string;
}

/**
 * Represents the scope at which a formatter setting is configured.
 * - 'user': Configured in user settings, applies globally across all workspaces
 * - 'workspace': Configured in workspace settings, applies to the current workspace
 * - 'folder': Configured in folder settings, applies to a specific workspace folder
 * - 'auto': No explicit configuration, formatter is automatically selected (e.g., only one available)
 * - 'none': No formatter is configured or available
 */
export type FormatterSettingScope = 'user' | 'workspace' | 'folder' | 'auto' | 'none';

export interface FormatterStatus {
    formatter: FormatterInfo | undefined;
    scope: FormatterSettingScope;
    /**
     * If true, the configured formatter ID does not match any available formatter.
     * The configuredFormatterId will contain the invalid ID.
     */
    isInvalid: boolean;
    /**
     * The formatter ID that was configured in settings, even if it doesn't exist.
     */
    configuredFormatterId: string | undefined;
}

export interface FormatterService {
    /**
     * Event fired when formatters change (e.g., new formatter registered/unregistered)
     */
    readonly onDidChangeFormatters: Event<void>;

    /**
     * Get the complete formatter status including the formatter info, scope, and validation state.
     * This is the preferred method to get formatter information as it provides all necessary context.
     */
    getFormatterStatus(editor: TextEditor): FormatterStatus;

    /**
     * Get all available formatters for the given editor's language
     */
    getAvailableFormatters(editor: TextEditor): FormatterInfo[];

    /**
     * Set the default formatter for the given language or editor's language
     * @param languageIdOrEditor The language ID or editor to set the formatter for
     * @param formatterId The formatter ID, or undefined to clear the setting
     * @param scope The preference scope to save to
     */
    setDefaultFormatter(languageIdOrEditor: string | TextEditor, formatterId: string | undefined, scope: PreferenceScope): Promise<void>;

    /**
     * Get the default formatter ID for the given language and resource URI.
     * This is used internally during formatting operations.
     * @param languageId The language identifier
     * @param resourceUri The resource URI
     * @returns The formatter ID or undefined if not set
     */
    getDefaultFormatter(languageId: string, resourceUri: string): string | undefined;

    /**
     * Get the scope at which the formatter is currently configured for the given editor.
     * Returns undefined if no formatter is configured.
     * @param editor The text editor
     * @returns The preference scope where the formatter is set, or undefined
     */
    getConfiguredScope(editor: TextEditor): PreferenceScope | undefined;
}
