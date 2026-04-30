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
import { Plugin, PluginManager, LocalizationExt } from '../common/plugin-api-rpc';
import { createAPIFactory } from './plugin-context';
import type { TerminalPluginApiNamespace } from './terminal-ext-plugin-api-contribution';
import type { ScmPluginApiNamespace } from './scm-ext-plugin-api-contribution';
import { EnvExtImpl } from './env';
import { DebugExtImpl } from './debug/debug-ext';
import { PreferenceRegistryExtImpl } from './preference-registry';
import { EditorsAndDocumentsExtImpl } from './editors-and-documents';
import { WorkspaceExtImpl } from './workspace';
import { MessageRegistryExt } from './message-registry';
import { ClipboardExt } from './clipboard-ext';
import { WebviewsExtImpl } from './webviews';
import type { LocalizationExtImpl } from './localization-ext';
import { TerminalServiceExtImpl } from './terminal-ext';
import { CommandRegistryImpl } from './command-registry';
import { ScmExtImpl } from './scm';
import { AbstractPluginManagerExtImpl } from './plugin-manager';

/**
 * The terminal-owned keys at the top level of `typeof theia`.
 */
type TerminalTopLevelKeys = keyof Omit<TerminalPluginApiNamespace, 'window'>;

/**
 * The terminal-owned keys within `theia.window`.
 */
type TerminalWindowKeys = keyof TerminalPluginApiNamespace['window'];

/**
 * The SCM-owned keys at the top level of `typeof theia`.
 */
type ScmTopLevelKeys = keyof ScmPluginApiNamespace;

/**
 * The shape of the legacy contribution's return — everything in `typeof theia`
 * except the properties owned by extracted contributions (terminal, SCM, etc.).
 *
 * As more slices are extracted, this type narrows further: each extraction adds
 * its keys to the `Omit` lists here. When the legacy contribution is empty,
 * this type becomes `{}` and the contribution can be removed.
 */
export type LegacyPluginApiNamespace =
    Omit<typeof theia, TerminalTopLevelKeys | ScmTopLevelKeys | 'window'> & {
        window: Omit<typeof theia.window, TerminalWindowKeys>;
    };

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

    @inject(TerminalServiceExtImpl)
    protected readonly terminalExt: TerminalServiceExtImpl;

    @inject(CommandRegistryImpl)
    protected readonly commandRegistry: CommandRegistryImpl;

    @inject(ScmExtImpl)
    protected readonly scmExt: ScmExtImpl;

    protected apiFactory: ((plugin: Plugin) => LegacyPluginApiNamespace) | undefined;

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
            this.localizationExt,
            this.terminalExt,
            this.commandRegistry,
            this.scmExt
        );
    }

    createApiNamespace(plugin: Plugin): LegacyPluginApiNamespace {
        if (!this.apiFactory) {
            throw new Error('LegacyExtPluginApiContribution: registerExtImplementations must be called before createApiNamespace');
        }
        return this.apiFactory(plugin);
    }
}
