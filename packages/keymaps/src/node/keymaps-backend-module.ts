/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { FileUri } from '@theia/core/lib/node';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common';
import { CustomKeymapsServer, KeybindingURI } from './keymaps-server';
import { KeymapsServer, keybindingsPath, KeybindingClient } from '../common/keymaps-protocol';
import { KeymapsService } from '../common/keymaps-service';
import { ContainerModule } from 'inversify';
import * as os from 'os';

export default new ContainerModule(bind => {

    const homeUri = FileUri.create(os.homedir());

    bind(KeybindingURI).toConstantValue(homeUri.withPath(homeUri.path.join('.theia', 'keymaps.json')));
    bind(CustomKeymapsServer).toSelf();
    bind(KeymapsServer).to(CustomKeymapsServer);
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<KeybindingClient>(keybindingsPath, client => {
            const server = ctx.container.get<KeymapsServer>(KeymapsServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();

    bind(KeymapsService).toSelf();

});
