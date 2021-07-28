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

import { OVSXClient, OVSXClientOptions } from '@theia/ovsx-client/lib';

/**
 * In some instances, the OVSXClient must be created asynchronously. This class
 * makes it possible to get an un-initialized instance and wait for it to be ready.
 */
export class OVSXAsyncClient extends OVSXClient {

    /**
     * Resolves once the initial asynchronous options are resolved.
     *
     * Calling methods before this promise is resolved will throw errors.
     */
    readonly ready: Promise<OVSXAsyncClient>;

    constructor(asyncOptions: Promise<OVSXClientOptions>) {
        super(undefined!); // hack: using methods at this point will fail.
        this.ready = asyncOptions.then(options => {
            (this.options as OVSXClientOptions) = options;
            return this;
        });
    }
}
