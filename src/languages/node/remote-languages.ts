import { Diagnostic } from 'vscode-languageserver-types';
import { Languages, DiagnosticCollection } from "../common";
import { DocumentSelector } from "vscode-languageclient/lib/base";
import { IConnection } from "vscode-languageserver";
import { Disposable } from "../../application/common";

export class RemoteLanguages implements Languages, Disposable {

    protected connection: IConnection;

    dispose(): void {
        /* no-op*/
    }

    listen(connection: IConnection): void {
        this.connection = connection;
    }

    match(selector: DocumentSelector, document: {
        uri: string;
        languageId: string;
    }): boolean {
        // TODO
        return true;
    }

    createDiagnosticCollection?(name?: string): DiagnosticCollection {
        const connection = this.connection;
        return {
            set(uri: string, diagnostics: Diagnostic[]): void {
                connection.sendDiagnostics({
                    uri, diagnostics
                });
            },
            dispose() {
                // no-op
            }
        }
    }

}
