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

import * as http from 'http';
import { injectable, inject } from 'inversify';
import { MessagingContribution } from '../../node/messaging/messaging-contribution';
import { ElectronTokenValidator } from './electron-token-validator';

/**
 * Override the browser MessagingContribution class to refuse connections that do not include a specific token.
 * @deprecated since 1.8.0
 */
@injectable()
export class ElectronMessagingContribution extends MessagingContribution {

    @inject(ElectronTokenValidator)
    protected readonly tokenValidator: ElectronTokenValidator;

    /**
     * Only allow token-bearers.
     */
    protected async allowConnect(request: http.IncomingMessage): Promise<boolean> {
        if (this.tokenValidator.allowRequest(request)) {
            return super.allowConnect(request);
        }
        return false;
    }
}
