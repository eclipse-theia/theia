// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import * as monaco from '@theia/monaco-editor-core';
import { IStandaloneTheme } from '@theia/monaco-editor-core/esm/vs/editor/standalone/common/standaloneTheme';
import { IOnigLib, Registry } from 'vscode-textmate';
import { IRawTheme } from 'vscode-textmate/release/theme';

export interface ThemeMix extends IRawTheme, monaco.editor.IStandaloneThemeData { }
export interface MixStandaloneTheme extends IStandaloneTheme {
    themeData: ThemeMix
}

export const OnigasmProvider = Symbol('OnigasmProvider');
export type OnigasmProvider = () => Promise<IOnigLib>;
export const TextmateRegistryFactory = Symbol('TextmateRegistryFactory');
export type TextmateRegistryFactory = (currentTheme?: ThemeMix) => Registry;

export type MonacoThemeColor = monaco.editor.IColors;
export interface MonacoTokenRule extends monaco.editor.ITokenThemeRule { };
export type MonacoBuiltinTheme = monaco.editor.BuiltinTheme;
export interface MonacoTheme extends monaco.editor.IStandaloneThemeData {
    name: string;
}
