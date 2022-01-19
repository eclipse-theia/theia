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
import { MaybePromise } from '../../common/types';
import { RequestConfiguration, RequestService } from '@theia/request-service';
import { Argv, Arguments } from 'yargs';
import { CliContribution } from '../cli';

export const ProxyUrl = 'proxy-url';
export const ProxyAuthorization = 'proxy-authorization';
export const StrictSSL = 'strict-ssl';

@injectable()
export class ProxyCliContribution implements CliContribution {

    @inject(RequestService)
    protected readonly requestService: RequestService;

    configure(conf: Argv): void {
        conf.option(ProxyUrl, {
            description: 'Sets the proxy URL for outgoing requests.',
            type: 'string'
        });
        conf.option(ProxyAuthorization, {
            description: 'Sets the proxy authorization header for outgoing requests.',
            type: 'string'
        });
        conf.option(StrictSSL, {
            description: 'Detemines whether SSL is strictly set for outgoing requests.',
            type: 'boolean'
        });
    }

    setArguments(args: Arguments): MaybePromise<void> {
        const proxyUrl = args[ProxyUrl];
        const authorization = args[ProxyAuthorization];
        const strictSSL = args[StrictSSL];
        const config: RequestConfiguration = {};
        if (typeof proxyUrl === 'string') {
            config.proxyUrl = proxyUrl.trim();
        }
        if (typeof authorization === 'string') {
            config.proxyAuthorization = authorization;
        }
        if (typeof strictSSL === 'boolean') {
            config.strictSSL = strictSSL;
        }
        this.requestService.configure(config);
    }

}
