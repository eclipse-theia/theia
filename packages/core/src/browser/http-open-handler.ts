// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import URI from '../common/uri';
import { OpenHandler } from './opener-service';
import { WindowService } from './window/window-service';
import { ExternalUriService } from './external-uri-service';

export interface HttpOpenHandlerOptions {
    openExternal?: boolean
}

@injectable()
export class HttpOpenHandler implements OpenHandler {

    readonly id = 'http';

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(ExternalUriService)
    protected readonly externalUriService: ExternalUriService;

    canHandle(uri: URI, options?: HttpOpenHandlerOptions): number {
        return ((options && options.openExternal) || uri.scheme.startsWith('http') || uri.scheme.startsWith('mailto')) ? 500 : 0;
    }

    async open(uri: URI): Promise<undefined> {
        const resolvedUri = await this.externalUriService.resolve(uri);
        return this.windowService.openNewWindow(resolvedUri.toString(true), { external: true });
    }

}
