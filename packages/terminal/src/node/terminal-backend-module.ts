/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { MessagingService } from '@theia/core/lib/node/messaging/messaging-service';
import { ContainerModule } from '@theia/core/shared/inversify';
import { createCommonBindings } from '../common/terminal-common-module';
import { RemoteTerminalServer } from '../common/terminal-protocol';
import { RemoteTerminalServerImpl } from './remote-terminal-server';

export default new ContainerModule(bind => {
    createCommonBindings(bind);
    bind(RemoteTerminalServer).to(RemoteTerminalServerImpl).inSingletonScope();
    bind(MessagingService.Contribution).toService(RemoteTerminalServer);
});
