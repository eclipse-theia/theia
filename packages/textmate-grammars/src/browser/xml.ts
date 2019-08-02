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

import { LanguageGrammarDefinitionContribution, TextmateRegistry, GrammarDefinition } from '@theia/monaco/lib/browser/textmate';
import { injectable } from 'inversify';

@injectable()
export class XmlContribution implements LanguageGrammarDefinitionContribution {

    readonly id = 'xml';
    readonly scopeName = 'text.xml';

    registerTextmateLanguage(registry: TextmateRegistry): void {
        monaco.languages.register({
            id: this.id,
            extensions: [
                '.xml',
                '.xsd',
                '.ascx',
                '.atom',
                '.axml',
                '.bpmn',
                '.config',
                '.cpt',
                '.csl',
                '.csproj',
                '.csproj.user',
                '.dita',
                '.ditamap',
                '.dtd',
                '.dtml',
                '.fsproj',
                '.fxml',
                '.iml',
                '.isml',
                '.jmx',
                '.launch',
                '.menu',
                '.mxml',
                '.nuspec',
                '.opml',
                '.owl',
                '.proj',
                '.props',
                '.pt',
                '.publishsettings',
                '.pubxml',
                '.pubxml.user',
                '.rdf',
                '.rng',
                '.rss',
                '.shproj',
                '.storyboard',
                '.svg',
                '.targets',
                '.tld',
                '.tmx',
                '.vbproj',
                '.vbproj.user',
                '.vcxproj',
                '.vcxproj.filters',
                '.wsdl',
                '.wxi',
                '.wxl',
                '.wxs',
                '.xaml',
                '.xbl',
                '.xib',
                '.xlf',
                '.xliff',
                '.xpdl',
                '.xul',
                '.xoml'
            ],
            firstLine: '(\\<\\?xml.*)|(\\<svg)|(\\<\\!doctype\\s+svg)',
            aliases: ['XML', 'xml'],
            mimetypes: ['text/xml', 'application/xml', 'application/xaml+xml', 'application/xml-dtd']
        });
        monaco.languages.setLanguageConfiguration(this.id, {
            comments: {
                blockComment: ['<!--', '-->'],
            },
            brackets: [
                ['<', '>']
            ],
            autoClosingPairs: [
                { open: '<', close: '>' },
                { open: '\'', close: '\'' },
                { open: '"', close: '"' },
            ],
            surroundingPairs: [
                { open: '<', close: '>' },
                { open: '\'', close: '\'' },
                { open: '"', close: '"' },
            ]
        });

        const grammar = require('../../data/xml.tmLanguage.json');
        registry.registerTextmateGrammarScope(this.scopeName, {
            async getGrammarDefinition(): Promise<GrammarDefinition> {
                return {
                    format: 'json',
                    content: grammar
                };
            }
        });
        registry.mapLanguageIdToTextmateGrammar(this.id, this.scopeName);
    }
}
