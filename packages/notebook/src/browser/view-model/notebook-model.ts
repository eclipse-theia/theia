// *****************************************************************************
// Copyright (C) 2023 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, URI } from '@theia/core';
import { CellDto, NotebookData } from '../../common';

export class NotebookModel implements Disposable {

    cells: CellDto[];

    dirty: boolean;

    constructor(data: NotebookData, public uri: URI, public viewType: string) {
        this.cells = data.cells;
        this.dirty = false;
    }

    dispose(): void {

    }

    save(): Promise<boolean> {
        return Promise.resolve(true);
    }
}
