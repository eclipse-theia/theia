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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { TextmateRegistry } from './textmate-registry';
import * as monaco from '@theia/monaco-editor-core';

/**
 * Callback for extensions to contribute language grammar definitions
 */
export const LanguageGrammarDefinitionContribution = Symbol('LanguageGrammarDefinitionContribution');
export interface LanguageGrammarDefinitionContribution {
    registerTextmateLanguage(registry: TextmateRegistry): void;
}
export function getEncodedLanguageId(languageId: string): number {
    return monaco.languages.getEncodedLanguageId(languageId);
}
