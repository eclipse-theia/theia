/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, decorate } from "inversify";
import { MonacoLanguages as BaseMonacoLanguages, ProtocolToMonacoConverter, MonacoToProtocolConverter } from "monaco-languageclient";
import { Languages, DiagnosticCollection, Language } from "@theia/languages/lib/common";
import { ProblemManager } from "@theia/markers/lib/browser/problem/problem-manager";
import URI from '@theia/core/lib/common/uri';
import { WorkspaceSymbolProvider } from 'vscode-base-languageclient/lib/services';
import { Disposable } from 'vscode-jsonrpc';

decorate(injectable(), BaseMonacoLanguages);
decorate(inject(ProtocolToMonacoConverter), BaseMonacoLanguages, 0);
decorate(inject(MonacoToProtocolConverter), BaseMonacoLanguages, 1);

@injectable()
export class MonacoLanguages extends BaseMonacoLanguages implements Languages {

    workspaceSymbolProviders: WorkspaceSymbolProvider[] = [];

    constructor(
        @inject(ProtocolToMonacoConverter) p2m: ProtocolToMonacoConverter,
        @inject(MonacoToProtocolConverter) m2p: MonacoToProtocolConverter,
        @inject(ProblemManager) protected readonly problemManager: ProblemManager
    ) {
        super(p2m, m2p);
    }

    createDiagnosticCollection(name?: string): DiagnosticCollection {
        // FIXME: Monaco model markers should be created based on Theia problem markers
        const monacoCollection = super.createDiagnosticCollection(name);
        const owner = name || 'default';
        const uris: string[] = [];
        return {
            set: (uri, diagnostics) => {
                monacoCollection.set(uri, diagnostics);
                this.problemManager.setMarkers(new URI(uri), owner, diagnostics);
                uris.push(uri);
            },
            dispose: () => {
                monacoCollection.dispose();
                for (const uri of uris) {
                    this.problemManager.setMarkers(new URI(uri), owner, []);
                }
            }
        };
    }

    registerWorkspaceSymbolProvider(provider: WorkspaceSymbolProvider): Disposable {
        this.workspaceSymbolProviders.push(provider);
        return {
            dispose: () => {
                const index = this.workspaceSymbolProviders.indexOf(provider);
                this.workspaceSymbolProviders = this.workspaceSymbolProviders.splice(index, 1);
            }
        };
    }

    get languages(): Language[] {
        const monacoLanguages: monaco.languages.ILanguageExtensionPoint[] = monaco.languages.getLanguages();
        return monacoLanguages.map((monacoLang: monaco.languages.ILanguageExtensionPoint) => ({
            id: monacoLang.id,
            name: monacoLang.aliases && monacoLang.aliases.length > 0 ? monacoLang.aliases[0] : monacoLang.id
        }));
    }

}
