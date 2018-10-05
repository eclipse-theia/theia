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

import { injectable, inject } from 'inversify';
import { InMemoryResources } from '../common/resource';
import { Disposable } from '../common/disposable';
import { Emitter } from '../common/event';

import debounce = require('lodash.debounce');

export interface JsonSchemaConfiguration {
    url: string
    fileMatch: string[]
}

@injectable()
export class JsonSchemaStore {
    @inject(InMemoryResources) resources: InMemoryResources;

    private _schemas: JsonSchemaConfiguration[] = [];

    protected readonly onSchemasChangedEmitter = new Emitter<void>();
    readonly onSchemasChanged = this.onSchemasChangedEmitter.event;

    protected notifyChanged = debounce(() => {
        this.onSchemasChangedEmitter.fire(undefined);
    }, 500);

    registerSchema(config: JsonSchemaConfiguration): Disposable {
        this._schemas.push(config);
        this.notifyChanged();
        return Disposable.create(() => {
            const idx = this._schemas.indexOf(config);
            if (idx > -1) {
                this._schemas.splice(idx, 1);
                this.notifyChanged();
            }
        });
    }

    getJsonSchemaConfigurations(): JsonSchemaConfiguration[] {
        return [ ...this._schemas];
    }

}
