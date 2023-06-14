
// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************
import { Event } from '@theia/core';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import { ThemeIcon } from '@theia/monaco-editor-core/esm/vs/platform/theme/common/themeService';
import { URI } from '@theia/core/shared/vscode-uri';

//  ------ API types

export type IconIdentifier = string;

// icon registry
export const Extensions = {
    IconContribution: 'base.contributions.icons'
};

export type IconDefaults = ThemeIcon | IconDefinition;

export interface IconDefinition {
    font?: IconFontContribution; // undefined for the default font (codicon)
    fontCharacter: string;
}

export interface IconContribution {
    readonly id: string;
    description: string | undefined;
    deprecationMessage?: string;
    readonly defaults: IconDefaults;
}

export interface IconFontContribution {
    readonly id: string;
    readonly definition: IconFontDefinition;
}

export interface IconFontDefinition {
    readonly weight?: string;
    readonly style?: string;
    readonly src: IconFontSource[];
}

export interface IconFontSource {
    readonly location: URI;
    readonly format: string;
}

export const IconRegistry = Symbol('IconRegistry');
export interface IconRegistry {

    readonly onDidChange: Event<void>;

    /**
     * Register a icon to the registry.
     * @param id The icon id
     * @param defaults The default values
     * @param description The description
     */
    registerIcon(id: IconIdentifier, defaults: IconDefaults, description?: string): ThemeIcon;

    /**
     * Deregister a icon from the registry.
     */
    deregisterIcon(id: IconIdentifier): void;

    /**
     * Get all icon contributions
     */
    getIcons(): IconContribution[];

    /**
     * Get the icon for the given id
     */
    getIcon(id: IconIdentifier): IconContribution | undefined;

    /**
     * JSON schema for an object to assign icon values to one of the icon contributions.
     */
    getIconSchema(): IJSONSchema;

    /**
     * JSON schema to for a reference to a icon contribution.
     */
    getIconReferenceSchema(): IJSONSchema;

    /**
     * Register a icon font to the registry.
     * @param id The icon font id
     * @param definition The icon font definition
     */
    registerIconFont(id: string, definition: IconFontDefinition): IconFontDefinition;

    /**
     * Deregister an icon font to the registry.
     */
    deregisterIconFont(id: string): void;

    /**
     * Get the icon font for the given id
     */
    getIconFont(id: string): IconFontDefinition | undefined;
}

export const IconsStyleSheet = Symbol('IconsStyleSheet');
export interface IconsStyleSheet {
    getCSS(): string;
    readonly onDidChange: Event<void>;
}

export const IconStyleSheetService = Symbol('IconStyleSheetService');
export interface IconStyleSheetService {
    getIconsStyleSheet(): IconsStyleSheet;
}

