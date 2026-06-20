// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ContextKeyService, ContextKey } from '@theia/core/lib/browser/context-key-service';

@injectable()
export class ScmContextKeyService {

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    protected _scmProvider: ContextKey<string | undefined>;
    get scmProvider(): ContextKey<string | undefined> {
        return this._scmProvider;
    }

    protected _scmProviderContext: ContextKey<string | undefined>;
    get scmProviderContext(): ContextKey<string | undefined> {
        return this._scmProviderContext;
    }

    protected _scmResourceGroup: ContextKey<string | undefined>;
    get scmResourceGroup(): ContextKey<string | undefined> {
        return this._scmResourceGroup;
    }

    protected _scmResourceGroupState: ContextKey<string | undefined>;
    get scmResourceGroupState(): ContextKey<string | undefined> {
        return this._scmResourceGroupState;
    }

    protected _scmProviderCount: ContextKey<number>;
    get scmProviderCount(): ContextKey<number> {
        return this._scmProviderCount;
    }

    protected _scmHistoryItemRef: ContextKey<string | undefined>;
    get scmHistoryItemRef(): ContextKey<string | undefined> {
        return this._scmHistoryItemRef;
    }

    protected _scmCurrentHistoryItemRefHasRemote: ContextKey<boolean>;
    get scmCurrentHistoryItemRefHasRemote(): ContextKey<boolean> {
        return this._scmCurrentHistoryItemRefHasRemote;
    }

    protected _scmCurrentHistoryItemRefHasBase: ContextKey<boolean>;
    get scmCurrentHistoryItemRefHasBase(): ContextKey<boolean> {
        return this._scmCurrentHistoryItemRefHasBase;
    }

    @postConstruct()
    protected init(): void {
        this._scmProvider = this.contextKeyService.createKey<string | undefined>('scmProvider', undefined);
        this._scmProviderContext = this.contextKeyService.createKey<string | undefined>('scmProviderContext', undefined);
        this._scmResourceGroup = this.contextKeyService.createKey<string | undefined>('scmResourceGroup', undefined);
        this._scmResourceGroupState = this.contextKeyService.createKey<string | undefined>('scmResourceGroupState', undefined);
        this._scmProviderCount = this.contextKeyService.createKey<number>('scm.providerCount', 0);
        this._scmHistoryItemRef = this.contextKeyService.createKey<string | undefined>('scmHistoryItemRef', undefined);
        this._scmCurrentHistoryItemRefHasRemote = this.contextKeyService.createKey<boolean>('scmCurrentHistoryItemRefHasRemote', false);
        this._scmCurrentHistoryItemRefHasBase = this.contextKeyService.createKey<boolean>('scmCurrentHistoryItemRefHasBase', false);
    }

    match(expression: string | undefined): boolean {
        return !expression || this.contextKeyService.match(expression);
    }

}
