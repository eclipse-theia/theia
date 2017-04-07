import { Diagnostic } from 'vscode-languageserver-types';
import { DiagnosticCollection } from 'vscode-languageclient/lib/services';
import { p2m } from './monaco-converter';
import { Disposable, DisposableCollection } from '../../application/common';
import Uri = monaco.Uri;
import IModel = monaco.editor.IModel;
import IMarkerData = monaco.editor.IMarkerData;

export class MonacoDiagnosticCollection implements DiagnosticCollection {

    protected readonly diagnostics = new Map<string, MonacoModelDiagnostics | undefined>();
    protected readonly toDispose = new DisposableCollection();

    constructor(protected readonly name: string) {
    }

    dispose() {
        this.toDispose.dispose();
    }

    get(uri: string): Diagnostic[] {
        const diagnostics = this.diagnostics.get(uri);
        return !!diagnostics ? diagnostics.diagnostics : [];
    }

    set(uri: string, diagnostics: Diagnostic[]): void {
        const existing = this.diagnostics.get(uri);
        if (existing) {
            existing.diagnostics = diagnostics;
        } else {
            const modelDiagnostics = new MonacoModelDiagnostics(uri, diagnostics, this.name);
            this.diagnostics.set(uri, modelDiagnostics);
            this.toDispose.push(Disposable.create(() => {
                this.diagnostics.delete(uri);
                modelDiagnostics.dispose();
            }));
        }
    }

}

export class MonacoModelDiagnostics implements Disposable {
    readonly uri: Uri;
    protected _markers: IMarkerData[];
    protected _diagnostics: Diagnostic[];
    constructor(uri: string, diagnostics: Diagnostic[], readonly owner: string) {
        this.uri = Uri.parse(uri);
        this.diagnostics = diagnostics;
        monaco.editor.onDidCreateModel(model => this.doUpdateModelMarkers(model));
    }

    set diagnostics(diagnostics: Diagnostic[]) {
        this._diagnostics = diagnostics;
        this._markers = diagnostics.map(p2m.asMarker);
        this.updateModelMarkers();
    }

    get diagnostics(): Diagnostic[] {
        return this._diagnostics;
    }

    get markers(): ReadonlyArray<IMarkerData> {
        return this._markers;
    }

    dispose(): void {
        this._markers = [];
        this.updateModelMarkers();
    }

    updateModelMarkers(): void {
        const model = monaco.editor.getModel(this.uri);
        this.doUpdateModelMarkers(model);
    }

    protected doUpdateModelMarkers(model: IModel | undefined): void {
        // FiXME compare uris after removing relative URIs
        if (model && this.uri.path.endsWith(model.uri.path)) {
            monaco.editor.setModelMarkers(model, this.owner, this._markers);
        }
    }
}
