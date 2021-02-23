/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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
import { Container } from '@theia/core/shared/inversify';
import { bindLogger } from '@theia/core/lib/node/logger-backend-module';
import { backendApplicationModule } from '@theia/core/lib/node/backend-application-module';
import processBackendModule from '@theia/process/lib/node/process-backend-module';
import { messagingBackendModule } from '@theia/core/lib/node/messaging/messaging-backend-module';
import terminalBackendModule from '../terminal-backend-module';
import { ApplicationPackage } from '@theia/core/shared/@theia/application-package';

export function createTerminalTestContainer(): Container {
    const container = new Container();

    container.load(backendApplicationModule);
    container.rebind(ApplicationPackage).toConstantValue({} as ApplicationPackage);

    bindLogger(container.bind.bind(container));
    container.load(messagingBackendModule);
    container.load(processBackendModule);
    container.load(terminalBackendModule);
    return container;
}
