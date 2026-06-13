// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type * as theia from '@theia/plugin';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { RPCProtocol } from '../common/rpc-protocol';
import { InternalPluginApiContribution } from '../common/plugin-ext-api-contribution';
import { MAIN_RPC_CONTEXT, Plugin } from '../common/plugin-api-rpc';
import { ScmExtImpl } from './scm';
import { SourceControlInputBoxValidationType, URI } from './types-impl';

/**
 * The shape of the SCM contribution to the plugin API namespace.
 *
 * This type defines exactly what properties `ScmExtPluginApiContribution`
 * adds to the `typeof theia` object. The assembler uses `DeepMerge` to combine
 * this with other contributions' types and verify the result against `typeof theia`.
 */
export interface ScmPluginApiNamespace {
    scm: typeof theia.scm;
    SourceControlInputBoxValidationType: typeof SourceControlInputBoxValidationType;
}

/**
 * SCM contribution to the ext-side plugin API.
 *
 * Extracted from the monolithic `createAPIFactory` following the terminal
 * extraction pattern. It handles:
 * - Registering `ScmExtImpl` on the RPC protocol
 * - Providing the `scm` namespace with `inputBox` and `createSourceControl`
 * - Providing `SourceControlInputBoxValidationType` type export
 */
@injectable()
export class ScmExtPluginApiContribution implements InternalPluginApiContribution {

    @inject(ScmExtImpl)
    protected readonly scmExt: ScmExtImpl;

    registerMainImplementations(_rpc: RPCProtocol, _container: interfaces.Container): void {
        // Main-side SCM registration is handled by LegacyMainPluginApiContribution.
    }

    registerExtImplementations(rpc: RPCProtocol): void {
        rpc.set(MAIN_RPC_CONTEXT.SCM_EXT, this.scmExt);
    }

    createApiNamespace(plugin: Plugin): ScmPluginApiNamespace {
        const scmExt = this.scmExt;
        return {
            scm: {
                get inputBox(): theia.SourceControlInputBox {
                    const inputBox = scmExt.getLastInputBox(plugin);
                    if (inputBox) {
                        return inputBox.apiObject;
                    } else {
                        throw new Error('Input box not found!');
                    }
                },
                createSourceControl(id: string, label: string, rootUri?: URI, iconPath?: theia.IconPath, isHidden?: boolean, parent?: theia.SourceControl): theia.SourceControl {
                    return scmExt.createSourceControl(plugin, id, label, rootUri, iconPath, isHidden, parent);
                }
            },
            SourceControlInputBoxValidationType,
        };
    }
}
