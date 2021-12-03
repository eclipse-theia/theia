/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

import { Diagnostic } from '@theia/core/shared/vscode-languageserver-protocol';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import { ProtocolToMonacoConverter } from './protocol-to-monaco-converter';
import IModel = monaco.editor.IModel;
import IMarkerData = monaco.editor.IMarkerData;

export class MonacoDiagnosticCollection implements Disposable {

    protected readonly diagnostics = new Map<string, MonacoModelDiagnostics | undefined>();
    protected readonly toDispose = new DisposableCollection();

    constructor(
        protected readonly name: string,
        protected readonly p2m: ProtocolToMonacoConverter) {
    }

    dispose(): void {
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
            const modelDiagnostics = new MonacoModelDiagnostics(uri, diagnostics, this.name, this.p2m);
            this.diagnostics.set(uri, modelDiagnostics);
            this.toDispose.push(Disposable.create(() => {
                this.diagnostics.delete(uri);
                modelDiagnostics.dispose();
            }));
        }
    }

}

export class MonacoModelDiagnostics implements Disposable {
    readonly uri: monaco.Uri;
    protected _markers: IMarkerData[] = [];
    protected _diagnostics: Diagnostic[] = [];
    constructor(
        uri: string,
        diagnostics: Diagnostic[],
        readonly owner: string,
        protected readonly p2m: ProtocolToMonacoConverter
    ) {
        this.uri = monaco.Uri.parse(uri);
        this.diagnostics = diagnostics;
        monaco.editor.onDidCreateModel(model => this.doUpdateModelMarkers(model));
    }

    set diagnostics(diagnostics: Diagnostic[]) {
        this._diagnostics = diagnostics;
        this._markers = this.p2m.asDiagnostics(diagnostics);
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
        this.doUpdateModelMarkers(model ? model : undefined);
    }

    protected doUpdateModelMarkers(model: IModel | undefined): void {
        if (model && this.uri.toString() === model.uri.toString()) {
            monaco.editor.setModelMarkers(model, this.owner, this._markers);
        }
    }
}
