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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { interfaces } from '@theia/core/shared/inversify';
import {
    PreferenceProxy,
    PreferenceSchema,
    PreferenceContribution
} from '@theia/core/lib/browser/preferences';
import { nls } from '@theia/core/lib/common/nls';
import { PreferenceProxyFactory } from '@theia/core/lib/browser/preferences/injectable-preference-proxy';

const nodeDownloadTemplateParts = [
    nls.localize('theia/remote/nodeDownloadTemplateVersion', '`{version}` for the used node version'),
    nls.localize('theia/remote/nodeDownloadTemplateOS', '`{os}` for the remote operating system. Either `win`, `linux` or `darwin`.'),
    nls.localize('theia/remote/nodeDownloadTemplateArch', '`{arch}` for the remote system architecture.'),
    nls.localize('theia/remote/nodeDownloadTemplateExt', '`{ext}` for the file extension. Either `zip`, `tar.xz` or `tar.xz`, depending on the operating system.')
];

export const RemotePreferenceSchema: PreferenceSchema = {
    'type': 'object',
    properties: {
        'remote.nodeDownloadTemplate': {
            type: 'string',
            default: '',
            markdownDescription: nls.localize(
                'theia/remote/nodeDownloadTemplate',
                'Controls the template used to download the node.js binaries for the remote backend. Points to the official node.js website by default. Uses multiple placeholders:'
            ) + '\n- ' + nodeDownloadTemplateParts.join('\n- ')
        },
    }
};

export interface RemoteConfiguration {
    'remote.nodeDownloadTemplate': string;
}

export const RemotePreferenceContribution = Symbol('RemotePreferenceContribution');
export const RemotePreferences = Symbol('GettingStartedPreferences');
export type RemotePreferences = PreferenceProxy<RemoteConfiguration>;

export function bindRemotePreferences(bind: interfaces.Bind): void {
    bind(RemotePreferences).toDynamicValue(ctx => {
        const factory = ctx.container.get<PreferenceProxyFactory>(PreferenceProxyFactory);
        return factory(RemotePreferenceSchema);
    }).inSingletonScope();
    bind(RemotePreferenceContribution).toConstantValue({ schema: RemotePreferenceSchema });
    bind(PreferenceContribution).toService(RemotePreferenceContribution);
}
