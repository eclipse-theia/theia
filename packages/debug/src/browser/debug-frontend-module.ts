/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import {ContainerModule, interfaces} from 'inversify';
import {DebugCommandHandlers} from "./debug-command";
import {MenuContribution} from "@theia/core/lib/common/menu";
import {CommandContribution} from "@theia/core/lib/common/command";
import {WebSocketConnectionProvider} from "@theia/core/lib/browser/messaging/connection";
import {DebugPath, Debug} from "../common/debug-model";

export default new ContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind) => {
    bind(MenuContribution).to(DebugCommandHandlers);
    bind(CommandContribution).to(DebugCommandHandlers);

    bind(Debug).toDynamicValue(context => WebSocketConnectionProvider.createProxy(context.container, DebugPath)).inSingletonScope();
});
