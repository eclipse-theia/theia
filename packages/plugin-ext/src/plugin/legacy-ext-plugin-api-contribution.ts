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

import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { RPCProtocol } from '../common/rpc-protocol';
import { InternalPluginApiContribution } from '../common/plugin-ext-api-contribution';
import { Plugin, PluginAPIFactory, PluginManager, LocalizationExt } from '../common/plugin-api-rpc';
import { createAPIFactory } from './plugin-context';
import { EnvExtImpl } from './env';
import { DebugExtImpl } from './debug/debug-ext';
import { PreferenceRegistryExtImpl } from './preference-registry';
import { EditorsAndDocumentsExtImpl } from './editors-and-documents';
import { WorkspaceExtImpl } from './workspace';
import { MessageRegistryExt } from './message-registry';
import { ClipboardExt } from './clipboard-ext';
import { WebviewsExtImpl } from './webviews';
import type { LocalizationExtImpl } from './localization-ext';
import { AbstractPluginManagerExtImpl } from './plugin-manager';

/**
 * Legacy contribution that wraps the monolithic `createAPIFactory()` function from
 * `plugin-context.ts` as an `InternalPluginApiContribution`.
 *
 * This is a transitional adapter. The long-term goal is to split the monolithic
 * `createAPIFactory` into smaller, per-feature contributions (terminal, debug, SCM, etc.).
 * In the meantime, this contribution wraps the entire existing implementation so that
 * call sites can be migrated to the contribution-based assembly pattern without
 * changing any runtime behaviour.
 *
 * Note: `createAPIFactory` both registers ext-side RPC implementations (`rpc.set(...)`)
 * and returns a per-plugin factory closure, all in one call. We cannot separate these two
 * concerns without refactoring the 1300-line function. So `registerExtImplementations`
 * performs both the RPC registration AND captures the factory closure, while
 * `createApiNamespace` delegates to that captured closure.
 */
@injectable()
export class LegacyExtPluginApiContribution implements InternalPluginApiContribution {

    @inject(RPCProtocol)
    protected readonly rpc: RPCProtocol;

    @inject(AbstractPluginManagerExtImpl)
    protected readonly pluginManager: PluginManager;

    @inject(EnvExtImpl)
    protected readonly envExt: EnvExtImpl;

    @inject(DebugExtImpl)
    protected readonly debugExt: DebugExtImpl;

    @inject(PreferenceRegistryExtImpl)
    protected readonly preferenceRegistryExt: PreferenceRegistryExtImpl;

    @inject(EditorsAndDocumentsExtImpl)
    protected readonly editorsAndDocumentsExt: EditorsAndDocumentsExtImpl;

    @inject(WorkspaceExtImpl)
    protected readonly workspaceExt: WorkspaceExtImpl;

    @inject(MessageRegistryExt)
    protected readonly messageRegistryExt: MessageRegistryExt;

    @inject(ClipboardExt)
    protected readonly clipboardExt: ClipboardExt;

    @inject(WebviewsExtImpl)
    protected readonly webviewExt: WebviewsExtImpl;

    @inject(LocalizationExt)
    protected readonly localizationExt: LocalizationExtImpl;

    protected apiFactory: PluginAPIFactory | undefined;

    registerMainImplementations(_rpc: RPCProtocol, _container: interfaces.Container): void {
        // No-op on the ext side — main-side registration is handled by LegacyMainPluginApiContribution
    }

    registerExtImplementations(rpc: RPCProtocol): void {
        // createAPIFactory both registers all ext-side implementations on the RPC protocol
        // (via rpc.set calls) and returns the per-plugin factory closure.
        this.apiFactory = createAPIFactory(
            rpc,
            this.pluginManager,
            this.envExt,
            this.debugExt,
            this.preferenceRegistryExt,
            this.editorsAndDocumentsExt,
            this.workspaceExt,
            this.messageRegistryExt,
            this.clipboardExt,
            this.webviewExt,
            this.localizationExt
        );
    }

    createApiNamespace(plugin: Plugin): Record<string, unknown> {
        if (!this.apiFactory) {
            throw new Error('LegacyExtPluginApiContribution: registerExtImplementations must be called before createApiNamespace');
        }
        // The factory returns a full `typeof theia` object for the given plugin.
        // We return it as Record<string, unknown> so the assembler can merge it
        // with contributions from other InternalPluginApiContributions.
        return this.apiFactory(plugin) as unknown as Record<string, unknown>;
    }
}
