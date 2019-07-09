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

import { injectable, postConstruct, inject } from 'inversify';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';

@injectable()
export class ViewContextKeyService {

    protected _view: ContextKey<string>;
    get view(): ContextKey<string> {
        return this._view;
    }

    protected _viewItem: ContextKey<string>;
    get viewItem(): ContextKey<string> {
        return this._viewItem;
    }

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @postConstruct()
    protected init(): void {
        this._view = this.contextKeyService.createKey('view', '');
        this._viewItem = this.contextKeyService.createKey('viewItem', '');
    }

    match(expression: string | undefined): boolean {
        return !expression || this.contextKeyService.match(expression);
    }

    with<T>(input: { view?: string, viewItem?: string }, cb: () => T): T {
        const view = this.view.get();
        const viewItem = this.viewItem.get();
        this.view.set(input.view);
        this.viewItem.set(input.viewItem);
        try {
            return cb();
        } finally {
            this.view.set(view);
            this.viewItem.set(viewItem);
        }
    }

}
