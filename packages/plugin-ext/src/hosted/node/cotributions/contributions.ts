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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ICommand {
    command: string;
    title: string;
    category?: string;
}

export interface IConfigurationProperty {
    description: string;
    type: string | string[];
    default?: any;
}

export interface IConfiguration {
    properties: { [key: string]: IConfigurationProperty; };
}

// export interface IDebugger {
// 	label?: string;
// 	type: string;
// 	runtime: string;
// }

export interface IGrammar {
    language: string;
}

export interface IJSONValidation {
    fileMatch: string;
    url: string;
}

export interface IKeyBinding {
    command: string;
    key: string;
    when?: string;
    mac?: string;
    linux?: string;
    win?: string;
}

export interface ILanguage {
    id: string;
    extensions: string[];
    aliases: string[];
}

export interface IMenu {
    command: string;
    alt?: string;
    when?: string;
    group?: string;
}

export interface ISnippet {
    language: string;
}

export interface ITheme {
    label: string;
}

export interface IViewContainer {
    id: string;
    title: string;
}

export interface IView {
    id: string;
    name: string;
}

export interface IColor {
    id: string;
    description: string;
    defaults: { light: string, dark: string, highContrast: string };
}

export interface IExtensionContributions {
    commands?: ICommand[];
    configuration?: IConfiguration;
    // debuggers?: IDebugger[]; implement debuggers
    grammars?: IGrammar[];
    jsonValidation?: IJSONValidation[];
    keybindings?: IKeyBinding[];
    languages?: ILanguage[];
    menus?: { [context: string]: IMenu[] };
    snippets?: ISnippet[];
    themes?: ITheme[];
    iconThemes?: ITheme[];
    viewsContainers?: { [location: string]: IViewContainer[] };
    views?: { [location: string]: IView[] };
    colors?: IColor[];
    // localizations?: ILocalization[]; // TODO implement localization for Theia...
}
