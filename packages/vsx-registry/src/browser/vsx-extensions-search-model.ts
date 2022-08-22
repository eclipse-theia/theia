// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';

export enum VSXSearchMode {
    Initial,
    None,
    Search,
    Installed,
    Builtin,
    Recommended,
}

export const BUILTIN_QUERY = '@builtin';
export const INSTALLED_QUERY = '@installed';
export const RECOMMENDED_QUERY = '@recommended';

@injectable()
export class VSXExtensionsSearchModel {

    protected _query = '';
    protected onDidChangeQueryEmitter = new Emitter<string>();
    protected specialQueries = new Map<string, VSXSearchMode>()
        .set(BUILTIN_QUERY, VSXSearchMode.Builtin)
        .set(INSTALLED_QUERY, VSXSearchMode.Installed)
        .set(RECOMMENDED_QUERY, VSXSearchMode.Recommended);

    get onDidChangeQuery(): Event<string> {
        return this.onDidChangeQueryEmitter.event;
    }

    set query(query: string) {
        if (this._query === query) {
            return;
        }
        this._query = query;
        this.onDidChangeQueryEmitter.fire(this._query);
    }

    get query(): string {
        return this._query;
    }

    getModeForQuery(): VSXSearchMode {
        return this.query
            ? this.specialQueries.get(this.query) ?? VSXSearchMode.Search
            : VSXSearchMode.None;
    }
}
