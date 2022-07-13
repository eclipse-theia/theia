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

import { ContainerModule } from 'inversify';
import { ProxyingBrowserRequestService } from '../../browser/request/browser-request-service';
import { RequestService } from '@theia/request';

export default new ContainerModule(bind => {
    // This version of the request service will always proxy every request through the backend.
    // We do this since the backend currently cannot automatically resolve proxies, but the frontend can.
    // We try to avoid confusion with this where some (frontend) requests successfully go through the proxy, but some others (backend) don't.
    bind(RequestService).to(ProxyingBrowserRequestService).inSingletonScope();
});
