/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as os from 'os';
import { ContainerModule } from 'inversify';
import { FileUri } from '@theia/core/lib/node';
import { keybindingsPath, KeybindingClient } from '../common/';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common';
import { CustomKeybindingServer, KeybindingURI } from './custom-keybinding-server';
import { KeybindingServer } from '../common';
import { CustomKeybindingService } from '../common';

/*
 * User preference server that watches the home directory of the user
 */

export default new ContainerModule(bind => {

    const homeUri = FileUri.create(os.homedir());

    bind(KeybindingURI).toConstantValue(homeUri.withPath(homeUri.path.join('.theia', 'keybindings.json')));

    bind(CustomKeybindingServer).toSelf();

    bind(KeybindingServer).to(CustomKeybindingServer);

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<KeybindingClient>(keybindingsPath, client => {
            const server = ctx.container.get<KeybindingServer>(KeybindingServer);
            server.setClient(client);
            client.onDidCloseConnection(() => server.dispose());
            return server;
        })
    ).inSingletonScope();

    bind(CustomKeybindingService).toSelf();

});
