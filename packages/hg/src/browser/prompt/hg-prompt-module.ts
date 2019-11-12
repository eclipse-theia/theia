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

import { ContainerModule, interfaces } from 'inversify';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging/ws-connection-provider';
import { HgPrompt, HgPromptServer, HgPromptServerProxy, HgPromptServerImpl } from '../../common/hg-prompt';

export default new ContainerModule(bind => {
    bind(HgPrompt).toSelf();
    bindPromptServer(bind);
});

export function bindPromptServer(bind: interfaces.Bind): void {
    bind(HgPromptServer).to(HgPromptServerImpl).inSingletonScope();
    bind(HgPromptServerProxy).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, HgPrompt.WS_PATH)).inSingletonScope();
}
