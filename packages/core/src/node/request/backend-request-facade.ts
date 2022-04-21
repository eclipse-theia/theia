/********************************************************************************
 * Copyright (C) 2022 TypeFox and others.
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

import { inject, injectable } from 'inversify';
import { CancellationToken } from 'vscode-languageserver-protocol';
import { RequestConfiguration, RequestContext, RequestOptions, RequestService } from '@theia/request-service';

@injectable()
export class BackendRequestFacade implements RequestService {

    @inject(RequestService)
    protected readonly requestService: RequestService;

    configure(config: RequestConfiguration): Promise<void> {
        return this.requestService.configure(config);
    }

    async request(options: RequestOptions, token?: CancellationToken): Promise<RequestContext> {
        const context = await this.requestService.request(options, token);
        return RequestContext.compress(context);
    }

    resolveProxy(url: string): Promise<string | undefined> {
        return this.requestService.resolveProxy(url);
    }

}
