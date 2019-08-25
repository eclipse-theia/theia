/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import debounce = require('lodash.debounce');

import { injectable, inject } from 'inversify';
import { InMemoryResources } from '../common/resource';
import { Disposable, DisposableCollection } from '../common/disposable';
import { Emitter } from '../common/event';
import URI from '../common/uri';

export interface JsonSchemaConfiguration {
    url: string
    fileMatch: string[]
}

@injectable()
export class JsonSchemaStore {

    @inject(InMemoryResources)
    protected readonly inMemoryResources: InMemoryResources;

    private readonly schemas: JsonSchemaConfiguration[] = [];

    protected readonly onSchemasChangedEmitter = new Emitter<void>();
    readonly onSchemasChanged = this.onSchemasChangedEmitter.event;

    protected notifyChanged = debounce(() => {
        this.onSchemasChangedEmitter.fire(undefined);
    }, 500);

    registerSchema(config: JsonSchemaConfiguration): Disposable {
        const toDispose = new DisposableCollection();
        const uri = new URI(config.url);
        if (uri.scheme === 'vscode') {
            const resource = this.inMemoryResources.resolve(new URI(config.url));
            if (resource && resource.onDidChangeContents) {
                toDispose.push(resource.onDidChangeContents(() => this.notifyChanged()));
            }
        }
        this.schemas.push(config);
        toDispose.push(Disposable.create(() => {
            const idx = this.schemas.indexOf(config);
            if (idx > -1) {
                this.schemas.splice(idx, 1);
                this.notifyChanged();
            }
        }));
        this.notifyChanged();
        return toDispose;
    }

    getJsonSchemaConfigurations(): JsonSchemaConfiguration[] {
        return [...this.schemas];
    }

}
