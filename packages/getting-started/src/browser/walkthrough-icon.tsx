// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { codicon } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { PluginSharedStyle } from '@theia/plugin-ext/lib/main/browser/plugin-shared-style';
import { Walkthrough } from '../common/walkthrough-types';

/**
 * Renders the icon of a walkthrough: the codicon it contributes itself if there is one, otherwise the icon
 * of the extension it comes from. Renders nothing when neither is available.
 */
export function WalkthroughIcon(props: { walkthrough: Walkthrough }): React.ReactElement | undefined {
    const { walkthrough } = props;
    const [failed, setFailed] = React.useState(false);

    if (walkthrough.icon) {
        return <span className={`gs-walkthrough-icon ${codicon(walkthrough.icon)}`}></span>;
    }
    if (walkthrough.pluginIcon && !failed) {
        return <img
            className='gs-walkthrough-icon gs-walkthrough-plugin-icon'
            src={PluginSharedStyle.toExternalIconUrl(walkthrough.pluginIcon)}
            alt=''
            onError={() => setFailed(true)}
        />;
    }
    return undefined;
}
