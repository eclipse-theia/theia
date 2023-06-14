// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

// copied from hhttps://github.com/microsoft/vscode/blob/6261075646f055b99068d3688932416f2346dd3b/src/vs/workbench/api/common/extHostLanguageFeatures.ts#L1291-L1310.

export class ReferenceMap<T> {
    private readonly _references = new Map<number, T>();
    private _idPool = 1;

    createReferenceId(value: T): number {
        const id = this._idPool++;
        this._references.set(id, value);
        return id;
    }

    disposeReferenceId(referenceId: number): T | undefined {
        const value = this._references.get(referenceId);
        this._references.delete(referenceId);
        return value;
    }

    get(referenceId: number): T | undefined {
        return this._references.get(referenceId);
    }
}
