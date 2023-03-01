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

import { URI } from '@theia/core';
import { BaseWidget, Navigatable } from '@theia/core/lib/browser';

export class NotebookWidget extends BaseWidget implements Navigatable {
    static readonly ID = 'notebook';

    constructor(private uri: URI, public readonly notebookType: string) {
        super();
        this.id = 'notebook:' + uri.toString();
    }

    getResourceUri(): URI | undefined {
        return this.uri;
    }
    createMoveToUri(resourceUri: URI): URI | undefined {
        throw new Error('Method not implemented.');
    }

}
