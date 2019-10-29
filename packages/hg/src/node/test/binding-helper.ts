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

import { Container, interfaces } from 'inversify';
import { Hg } from '../../common/hg';
import { HgImpl } from '../hg-impl';
import { bindLogger } from '@theia/core/lib/node/logger-backend-module';
import { HgInit, DefaultHgInit } from '../init/hg-init';
import { MessageService } from '@theia/core/lib/common';
import { MessageClient } from '@theia/core';

export function initializeBindings(): { container: Container, bind: interfaces.Bind } {
    const container = new Container();
    const bind = container.bind.bind(container);
    bind(DefaultHgInit).toSelf();
    bind(HgInit).toService(DefaultHgInit);
    bind(MessageService).toSelf();
    bind(MessageClient).toSelf();
    bind(HgImpl).toSelf();
    bind(Hg).toService(HgImpl);
    bindLogger(bind);
    return { container, bind };
}
