/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, PreferenceSchemaProvider } from '@theia/core/lib/browser';
import { MonacoSnippetSuggestProvider } from './monaco-snippet-suggest-provider';
import * as Monaco from 'monaco-editor-core';
import { setSnippetSuggestSupport } from 'monaco-editor-core/esm/vs/editor/contrib/suggest/browser/suggest';
import { CompletionItemProvider } from 'monaco-editor-core/esm/vs/editor/common/languages';

@injectable()
export class MonacoFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(MonacoSnippetSuggestProvider)
    protected readonly snippetSuggestProvider: MonacoSnippetSuggestProvider;

    @inject(PreferenceSchemaProvider)
    protected readonly preferenceSchema: PreferenceSchemaProvider;

    async initialize(): Promise<void> {
        // Incomparability of enum types between public and private API's
        setSnippetSuggestSupport(this.snippetSuggestProvider as unknown as CompletionItemProvider);

        for (const language of Monaco.languages.getLanguages()) {
            this.preferenceSchema.registerOverrideIdentifier(language.id);
        }
        const registerLanguage = Monaco.languages.register.bind(Monaco.languages);
        Monaco.languages.register = language => {
            // first register override identifier, because monaco will immediately update already opened documents and then initialize with bad preferences.
            this.preferenceSchema.registerOverrideIdentifier(language.id);
            registerLanguage(language);
        };
    }

}
