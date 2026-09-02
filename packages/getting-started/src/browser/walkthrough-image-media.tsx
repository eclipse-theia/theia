// *****************************************************************************
// Copyright (C) 2026 Renesas Electronics Corporation and others.
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

import type { ThemeService } from '@theia/core/lib/browser/theming';
import { ThemeType } from '@theia/core/lib/common/theme';
import * as React from '@theia/core/shared/react';
import { PluginSharedStyle } from '@theia/plugin-ext/lib/main/browser/plugin-shared-style';
import { resolveWalkthroughImageSource, WalkthroughImage } from './walkthrough-media-utils';

/**
 * https://github.com/microsoft/vscode/blob/1.134.0/src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedService.ts#L695-L729
 */
export interface WalkthroughImageMediaProps {
    image: WalkthroughImage;
    alt: string;
    themeService: ThemeService;
}

export function WalkthroughImageMedia(props: WalkthroughImageMediaProps): React.ReactElement | null {
    const [themeType, setThemeType] = React.useState<ThemeType>(
        () => props.themeService.getCurrentTheme().type,
    );
    const [failed, setFailed] = React.useState(false);
    React.useEffect(() => {
        const disposable = props.themeService.onDidColorThemeChange(event => setThemeType(event.newTheme.type));
        return () => disposable.dispose();
    }, [props.themeService]);
    const source = resolveWalkthroughImageSource(props.image, themeType);
    const src = source && PluginSharedStyle.toExternalIconUrl(source);
    React.useEffect(() => setFailed(false), [src]);
    return src && !failed
        ? <img className='gs-walkthrough-media-image' src={src} alt={props.alt} onError={() => setFailed(true)} />
        // eslint-disable-next-line no-null/no-null
        : null;
}
