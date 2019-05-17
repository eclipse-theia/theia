/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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
import {
    DecorationData,
    DecorationProvider,
    DecorationsExt,
    DecorationsMain,
    MAIN_RPC_CONTEXT
} from '../../../api/plugin-api';

import { interfaces } from 'inversify';
import { Emitter } from '@theia/core';
import { Tree, TreeDecoration } from '@theia/core/lib/browser';
import { RPCProtocol } from '../../../api/rpc-protocol';
import { ScmDecorationsService } from '@theia/scm/lib/browser/decorations/scm-decorations-service';

export class DecorationsMainImpl implements DecorationsMain {

    private readonly proxy: DecorationsExt;
    private readonly scmDecorationsService: ScmDecorationsService;

    protected readonly emitter = new Emitter<(tree: Tree) => Map<string, TreeDecoration.Data>>();

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.DECORATIONS_EXT);
        this.scmDecorationsService = container.get(ScmDecorationsService);
    }

    readonly providersMap: Map<number, DecorationProvider> = new Map();

    async $dispose(id: number): Promise<void> {
        this.providersMap.delete(id);
    }

    async $registerDecorationProvider(id: number, provider: DecorationProvider): Promise<number> {
        this.providersMap.set(id, provider);
        return id;
    }

    async $fireDidChangeDecorations(id: number, arg: string | string[] | undefined): Promise<void> {
        if (Array.isArray(arg)) {
            const result: Map<string, DecorationData> = new Map();
            for (const uri of arg) {
                const data = await this.proxy.$provideDecoration(id, uri);
                if (data) {
                    result.set(uri, data);
                }
            }
            this.scmDecorationsService.fireNavigatorDecorationsChanged(result);
        } else if (arg) {
            this.proxy.$provideDecoration(id, arg);
        }
    }
}
