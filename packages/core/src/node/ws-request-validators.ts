/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import { inject, injectable, named } from 'inversify';
import * as http from 'http';
import { ContributionProvider, MaybePromise } from '../common';

/**
 * Bind components to this symbol to filter WebSocket connections.
 */
export const WsRequestValidatorContribution = Symbol('RequestValidatorContribution');
export interface WsRequestValidatorContribution {
    /**
     * Return `false` to prevent the protocol upgrade from going through, blocking the WebSocket connection.
     *
     * @param request The HTTP connection upgrade request received by the server.
     */
    allowWsUpgrade(request: http.IncomingMessage): MaybePromise<boolean>;
}

/**
 * Central handler of `WsRequestValidatorContribution`.
 */
@injectable()
export class WsRequestValidator {

    @inject(ContributionProvider) @named(WsRequestValidatorContribution)
    protected readonly requestValidators: ContributionProvider<WsRequestValidatorContribution>;

    /**
     * Ask all bound `WsRequestValidatorContributions` if the WebSocket connection should be allowed or not.
     */
    async allowWsUpgrade(request: http.IncomingMessage): Promise<boolean> {
        return new Promise(async resolve => {
            await Promise.all(Array.from(this.requestValidators.getContributions(), async validator => {
                if (!await validator.allowWsUpgrade(request)) {
                    resolve(false); // bail on first refusal
                }
            }));
            resolve(true);
        });
    }
}
