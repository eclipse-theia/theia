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

import { Diagnostic, SymbolInformation } from '@theia/core/shared/vscode-languageserver-protocol';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ProblemManager } from '@theia/markers/lib/browser/problem/problem-manager';
import URI from '@theia/core/lib/common/uri';
import { MaybePromise, Mutable } from '@theia/core/lib/common/types';
import { Disposable } from '@theia/core/lib/common/disposable';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import { WorkspaceSymbolParams } from '@theia/core/shared/vscode-languageserver-protocol';
import { Language, LanguageService } from '@theia/core/lib/browser/language-service';
import { MonacoDiagnosticCollection } from './monaco-diagnostic-collection';
import { ProtocolToMonacoConverter } from './protocol-to-monaco-converter';

export interface WorkspaceSymbolProvider {
    provideWorkspaceSymbols(params: WorkspaceSymbolParams, token: CancellationToken): MaybePromise<SymbolInformation[] | undefined>;
    resolveWorkspaceSymbol?(symbol: SymbolInformation, token: CancellationToken): Thenable<SymbolInformation | undefined>
}

@injectable()
export class MonacoLanguages implements LanguageService {

    readonly workspaceSymbolProviders: WorkspaceSymbolProvider[] = [];

    protected readonly makers = new Map<string, MonacoDiagnosticCollection>();

    @inject(ProblemManager) protected readonly problemManager: ProblemManager;
    @inject(ProtocolToMonacoConverter) protected readonly p2m: ProtocolToMonacoConverter;

    @postConstruct()
    protected init(): void {
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
