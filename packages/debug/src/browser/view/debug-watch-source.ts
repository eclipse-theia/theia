/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { TreeSource } from '@theia/core/lib/browser/source-tree';
import { DebugViewModel } from './debug-view-model';
import { DebugWatchExpression } from './debug-watch-expression';
import debounce = require('p-debounce');

@injectable()
export class DebugWatchSource extends TreeSource {

    @inject(DebugViewModel)
    protected readonly model: DebugViewModel;

    constructor() {
        super({
            placeholder: 'No expressions'
        });
    }

    @postConstruct()
    protected init(): void {
        this.refresh();
        this.toDispose.push(this.model.onDidChangeWatchExpressions(() => this.refresh()));
    }

    protected readonly refresh = debounce(() => this.fireDidChange(), 100);

    async getElements(): Promise<IterableIterator<DebugWatchExpression>> {
        return this.model.watchExpressions[Symbol.iterator]();
    }

}
