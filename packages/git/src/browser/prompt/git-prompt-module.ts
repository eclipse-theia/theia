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

import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { WebSocketConnectionProvider } from '@theia/core/lib/browser/messaging/ws-connection-provider';
import { GitPrompt, GitPromptServer, GitPromptServerProxy, GitPromptServerImpl } from '../../common/git-prompt';

export default new ContainerModule(bind => {
    bind(GitPrompt).toSelf();
    bindPromptServer(bind);
});

export function bindPromptServer(bind: interfaces.Bind): void {
    bind(GitPromptServer).to(GitPromptServerImpl).inSingletonScope();
    bind(GitPromptServerProxy).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, GitPrompt.WS_PATH)).inSingletonScope();
}
