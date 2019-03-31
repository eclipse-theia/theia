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

// tslint:disable:no-any

import { injectable, inject } from 'inversify';
import { JsonRpcProxyFactory } from '@theia/core/lib/common/messaging/proxy-factory';
import { FileSystem, FileDeleteOptions } from '../common/filesystem';
import { FileSystemPreferences } from './filesystem-preferences';

@injectable()
export class FileSystemProxyFactory extends JsonRpcProxyFactory<FileSystem> {

    @inject(FileSystemPreferences)
    protected readonly preferences: FileSystemPreferences;

    get(target: FileSystem, propertyKey: PropertyKey, receiver: any): any {
        const property = super.get(target, propertyKey, receiver);
        if (propertyKey !== 'delete') {
            return property;
        }
        const deleteFn: FileSystem['delete'] = (uri, options) => {
            const opt: FileDeleteOptions = { ...options };
            if (opt.moveToTrash === undefined) {
                opt.moveToTrash = this.preferences['files.enableTrash'];
            }
            return property(uri, opt);
        };
        return deleteFn;
    }

}
