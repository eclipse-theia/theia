/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject, decorate } from 'inversify';
import {
    MonacoLanguages as BaseMonacoLanguages, ProtocolToMonacoConverter,
    MonacoToProtocolConverter
} from 'monaco-languageclient';
import { Languages, Diagnostic, DiagnosticCollection, Language, WorkspaceSymbolProvider } from '@theia/languages/lib/browser';
import { ProblemManager } from '@theia/markers/lib/browser/problem/problem-manager';
import URI from '@theia/core/lib/common/uri';
import { Mutable } from '@theia/core/lib/common/types';
import { Disposable } from '@theia/core/lib/common/disposable';
import { MonacoDiagnosticCollection } from 'monaco-languageclient/lib/monaco-diagnostic-collection';

decorate(injectable(), BaseMonacoLanguages);
decorate(inject(ProtocolToMonacoConverter), BaseMonacoLanguages, 0);
decorate(inject(MonacoToProtocolConverter), BaseMonacoLanguages, 1);

@injectable()
export class MonacoLanguages extends BaseMonacoLanguages implements Languages {

    readonly workspaceSymbolProviders: WorkspaceSymbolProvider[] = [];

    protected readonly makers = new Map<string, MonacoDiagnosticCollection>();

    constructor(
        @inject(ProtocolToMonacoConverter) p2m: ProtocolToMonacoConverter,
        @inject(MonacoToProtocolConverter) m2p: MonacoToProtocolConverter,
        @inject(ProblemManager) protected readonly problemManager: ProblemManager
    ) {
        super(p2m, m2p);
        for (const uri of this.problemManager.getUris()) {
            this.updateMarkers(new URI(uri));
        }
        this.problemManager.onDidChangeMarkers(uri => this.updateMarkers(uri));
    }

    protected updateMarkers(uri: URI): void {
        const uriString = uri.toString();
        const owners = new Map<string, Diagnostic[]>();
        for (const marker of this.problemManager.findMarkers({ uri })) {
            const diagnostics = owners.get(marker.owner) || [];
            diagnostics.push(marker.data);
            owners.set(marker.owner, diagnostics);
        }
        const toClean = new Set<string>(this.makers.keys());
        for (const [owner, diagnostics] of owners) {
            toClean.delete(owner);
            const collection = this.makers.get(owner) || new MonacoDiagnosticCollection(owner, this.p2m);
            collection.set(uriString, diagnostics);
            this.makers.set(owner, collection);
        }
        for (const owner of toClean) {
            const collection = this.makers.get(owner);
            if (collection) {
                collection.set(uriString, []);
            }
        }
    }

    createDiagnosticCollection(name?: string): DiagnosticCollection {
        const owner = name || 'default';
        const uris: string[] = [];
        return {
            set: (uri, diagnostics) => {
                this.problemManager.setMarkers(new URI(uri), owner, diagnostics);
                uris.push(uri);
            },
            dispose: () => {
                for (const uri of uris) {
                    this.problemManager.setMarkers(new URI(uri), owner, []);
                }
            }
        };
    }

    registerWorkspaceSymbolProvider(provider: WorkspaceSymbolProvider): Disposable {
        this.workspaceSymbolProviders.push(provider);
        return Disposable.create(() => {
            const index = this.workspaceSymbolProviders.indexOf(provider);
            if (index !== -1) {
                this.workspaceSymbolProviders.splice(index, 1);
            }
        });
    }

    get languages(): Language[] {
        return [...this.mergeLanguages(monaco.languages.getLanguages()).values()];
    }

    getLanguage(languageId: string): Language | undefined {
        return this.mergeLanguages(monaco.languages.getLanguages().filter(language => language.id === languageId)).get(languageId);
    }

    protected mergeLanguages(registered: monaco.languages.ILanguageExtensionPoint[]): Map<string, Mutable<Language>> {
        const languages = new Map<string, Mutable<Language>>();
        for (const { id, aliases, extensions, filenames } of registered) {
            const merged = languages.get(id) || {
                id,
                name: '',
                extensions: new Set(),
                filenames: new Set()
            };
            if (!merged.name && aliases && aliases.length) {
                merged.name = aliases[0];
            }
            if (extensions && extensions.length) {
                for (const extension of extensions) {
                    merged.extensions.add(extension);
                }
            }
            if (filenames && filenames.length) {
                for (const filename of filenames) {
                    merged.filenames.add(filename);
                }
            }
            languages.set(id, merged);
        }
        for (const [id, language] of languages) {
            if (!language.name) {
                language.name = id;
            }
        }
        return languages;
    }

}
