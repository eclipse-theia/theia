/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import * as tv from '../common/terminal-variables';

@injectable()
export class VariableCollectionsServerImpl implements tv.VariableCollectionsServer {

    @inject(tv.VariableCollectionsService)
    protected variableCollectionsService: tv.VariableCollectionsService;

    async setCollection(collectionIdentifier: string, persistent: boolean, collection: tv.SerializableEnvironmentVariableCollection): Promise<void> {
        const translatedCollection = { persistent, map: new Map<string, tv.EnvironmentVariableMutator>(collection) };
        this.variableCollectionsService.setCollection(collectionIdentifier, translatedCollection);
    }

    async deleteCollection(collectionIdentifier: string): Promise<void> {
        this.variableCollectionsService.deleteCollection(collectionIdentifier);
    }
}
