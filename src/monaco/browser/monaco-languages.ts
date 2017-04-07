import { injectable } from "inversify";
import { MonacoDiagnosticCollection } from './monaco-diagnostic-collection';
import { CompletionClientCapabilities, DocumentFilter, DocumentSelector } from 'vscode-languageclient/lib/protocol';
import { Disposable, DisposableCollection } from '../../application/common';
import { Languages, CompletionItemProvider, DiagnosticCollection } from "../../languages/common";
import { p2m, m2p } from './monaco-converter';
import Uri = monaco.Uri;

@injectable()
export class MonacoLanguages implements Languages {

    readonly completion: CompletionClientCapabilities = {
        completionItem: {
            snippetSupport: true
        }
    }

    match(selector: DocumentSelector, document: {
        uri: string;
        languageId: string;
    }): boolean {
        return this.matchModel(selector, {
            ...document,
            uri: Uri.parse(document.uri),
        });
    }

    createDiagnosticCollection?(name?: string): DiagnosticCollection  {
        return new MonacoDiagnosticCollection(name || 'default');
    }

    registerCompletionItemProvider(selector: DocumentSelector, provider: CompletionItemProvider, ...triggerCharacters: string[]): Disposable {
        const providers = new DisposableCollection();
        for (const language of monaco.languages.getLanguages()) {
            providers.push(monaco.languages.registerCompletionItemProvider(language.id, {
                triggerCharacters,
                provideCompletionItems: (model, position, token) => {
                    if (!this.matchModel(selector, { uri: model.uri, languageId: model.getModeId() })) {
                        return [];
                    }
                    const params = m2p.asTextDocumentPositionParams(model, position)
                    return provider.provideCompletionItems(params, token).then(p2m.asCompletionResult);
                }
            }));
        }
        return providers;
    }

    protected matchModel(selector: string | DocumentFilter | DocumentSelector, model: {
        uri: Uri;
        languageId: string;
    }): boolean {
        if (Array.isArray(selector)) {
            if (selector.length === 0) {
                return true;
            }
            return selector.findIndex(filter => this.matchModel(filter, model)) !== -1;
        }
        if (DocumentFilter.is(selector)) {
            if (!!selector.language && selector.language !== model.languageId) {
                return false;
            }
            if (!!selector.scheme && selector.scheme !== model.uri.scheme) {
                return false;
            }
            if (!!selector.pattern) {
                console.warn(`TODO: pattern is ignored: ${selector.pattern}`);
            }
            return true;
        }
        return selector === model.languageId;
    }

}
