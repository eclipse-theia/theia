// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { nls } from '@theia/core';
import { Localization } from '@theia/core/lib/common/i18n/localization';
import { LocalizationExt, LocalizationMain, Plugin, PLUGIN_RPC_CONTEXT, StringDetails } from '../common';
import { LanguagePackBundle } from '../common/language-pack-service';
import { RPCProtocol } from '../common/rpc-protocol';
import { URI } from './types-impl';

export class LocalizationExtImpl implements LocalizationExt {

    private readonly _proxy: LocalizationMain;
    private currentLanguage?: string;
    private isDefaultLanguage = true;
    private readonly bundleCache = new Map<string, LanguagePackBundle | undefined>();

    constructor(rpc: RPCProtocol) {
        this._proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.L10N_MAIN);
    }

    getMessage(pluginId: string, details: StringDetails): string {
        const { message, args, comment } = details;
        if (this.isDefaultLanguage) {
            return Localization.format(message, (args ?? {}));
        }

        let key = message;
        if (comment && comment.length > 0) {
            key += `/${Array.isArray(comment) ? comment.join() : comment}`;
        }
        const str = this.bundleCache.get(pluginId)?.contents[key];
        return Localization.format(str ?? message, (args ?? {}));
    }

    getBundle(pluginId: string): { [key: string]: string } | undefined {
        return this.bundleCache.get(pluginId)?.contents;
    }

    getBundleUri(pluginId: string): URI | undefined {
        const uri = this.bundleCache.get(pluginId)?.uri;
        return uri ? URI.parse(uri) : undefined;
    }

    async initializeLocalizedMessages(plugin: Plugin, currentLanguage: string): Promise<void> {
        this.currentLanguage ??= currentLanguage;
        this.isDefaultLanguage = this.currentLanguage === nls.defaultLocale;

        if (this.isDefaultLanguage) {
            return;
        }

        if (this.bundleCache.has(plugin.model.id)) {
            return;
        }

        let bundle: LanguagePackBundle | undefined;

        try {
            bundle = await this._proxy.$fetchBundle(plugin.model.id);
        } catch (e) {
            console.error(`Failed to load translations for ${plugin.model.id}: ${e.message}`);
            return;
        }

        this.bundleCache.set(plugin.model.id, bundle);
    }

}
