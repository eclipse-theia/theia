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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Starting with vscode 1.73.0, language pack bundles have changed their shape to accomodate the new `l10n` API.
 * They are now a record of { [englishValue]: translation }
 */
export interface LanguagePackBundle {
    contents: Record<string, string>
    uri: string
}

export const languagePackServicePath = '/services/languagePackService';

export const LanguagePackService = Symbol('LanguagePackService');

export interface LanguagePackService {
    storeBundle(pluginId: string, locale: string, bundle: LanguagePackBundle): void;
    deleteBundle(pluginId: string, locale?: string): void;
    getBundle(pluginId: string, locale: string): Promise<LanguagePackBundle | undefined>;
}
