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

import { MockLogger } from '../../common/test/mock-logger';
import { AbstractConnectionStatusService } from '../connection-status-service';
import { ILogger } from '../../common/logger';

export class MockConnectionStatusService extends AbstractConnectionStatusService {

    protected readonly logger: ILogger = new MockLogger();

    constructor() {
        super({
            offlineTimeout: 10
        });
    }

    public set alive(alive: boolean) {
        this.updateStatus(alive);
    }

}
