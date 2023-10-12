// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, Emitter } from '@theia/core';
import { CellOutput, CellOutputItem } from '../../common';

export class NotebookCellOutputModel implements Disposable {

    private didChangeDataEmitter = new Emitter<void>();
    readonly onDidChangeData = this.didChangeDataEmitter.event;

    private requestOutputPresentationChangeEmitter = new Emitter<void>();
    readonly onRequestOutputPresentationChange = this.requestOutputPresentationChangeEmitter.event;

    get outputId(): string {
        return this.rawOutput.outputId;
    }

    get outputs(): CellOutputItem[] {
        return this.rawOutput.outputs || [];
    }

    get metadata(): Record<string, unknown> | undefined {
        return this.rawOutput.metadata;
    }

    constructor(private rawOutput: CellOutput) { }

    replaceData(rawData: CellOutput): void {
        this.rawOutput = rawData;
        this.didChangeDataEmitter.fire();
    }

    appendData(items: CellOutputItem[]): void {
        this.rawOutput.outputs.push(...items);
        this.didChangeDataEmitter.fire();
    }

    dispose(): void {
        this.didChangeDataEmitter.dispose();
        this.requestOutputPresentationChangeEmitter.dispose();
    }

    requestOutputPresentationUpdate(): void {
        this.requestOutputPresentationChangeEmitter.fire();
    }

    getData(): CellOutput {
        return {
            outputs: this.outputs,
            metadata: this.metadata,
            outputId: this.outputId
        };
    }

}
