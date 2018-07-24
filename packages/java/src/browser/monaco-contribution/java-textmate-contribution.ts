/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable } from 'inversify';
import { JAVA_LANGUAGE_ID } from '../../common';
import { LanguageGrammarDefinitionContribution, TextmateRegistry } from '@theia/monaco/lib/browser/textmate';

@injectable()
export class JavaTextmateContribution implements LanguageGrammarDefinitionContribution {

    registerTextmateLanguage(registry: TextmateRegistry) {
        const javaDocGrammar = require('../../../data/javadoc.tmlanguage.json');
        registry.registerTextMateGrammarScope('text.html.javadoc', {
            async getGrammarDefinition() {
                return {
                    format: 'json',
                    content: javaDocGrammar
                };
            }
        });
        const scope = 'source.java';
        const javaGrammar = require('../../../data/java.tmlanguage.json');
        registry.registerTextMateGrammarScope(scope, {
            async getGrammarDefinition() {
                return {
                    format: 'json',
                    content: javaGrammar
                };
            }
        });

        registry.mapLanguageIdToTextmateGrammar(JAVA_LANGUAGE_ID, scope);
    }
}
