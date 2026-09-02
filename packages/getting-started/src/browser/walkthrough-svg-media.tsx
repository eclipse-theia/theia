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
import { nls } from '@theia/core/lib/common/nls';
import * as React from '@theia/core/shared/react';
import { createThemedSvgDocument, isSafeWalkthroughLink, isSvgLinkMessage } from './walkthrough-media-utils';

const walkthroughsLabel = nls.localizeByDefault('Walkthroughs');

/**
 * https://github.com/microsoft/vscode/blob/1.134.0/src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedDetailsRenderer.ts#L172-L234
 */
export interface WalkthroughSvgMediaProps {
    src: string;
    alt: string;
    themeService: ThemeService;
    onLinkClick?: (url: string) => void;
}

export function WalkthroughSvgMedia(props: WalkthroughSvgMediaProps): React.ReactElement | null {
    const [svg, setSvg] = React.useState<string>();
    const [themeRevision, setThemeRevision] = React.useState(0);
    // eslint-disable-next-line no-null/no-null
    const iframeRef = React.useRef<HTMLIFrameElement>(null);
    React.useEffect(() => {
        const controller = new AbortController();
        setSvg(undefined);
        fetch(props.src, { signal: controller.signal })
            .then(response => response.ok ? response.text() : undefined)
            .then(content => {
                if (!controller.signal.aborted) {
                    setSvg(content);
                }
            })
            .catch(() => undefined);
        return () => controller.abort();
    }, [props.src]);
    React.useEffect(() => {
        const disposable = props.themeService.onDidColorThemeChange(() => setThemeRevision(revision => revision + 1));
        return () => disposable.dispose();
    }, [props.themeService]);
    React.useEffect(() => {
        const listener = (event: MessageEvent): void => {
            if (event.source === iframeRef.current?.contentWindow && isSvgLinkMessage(event.data) && isSafeWalkthroughLink(event.data.href)) {
                props.onLinkClick?.(event.data.href);
            }
        };
        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
    }, [props.onLinkClick]);

    if (!svg) {
        // eslint-disable-next-line no-null/no-null
        return null;
    }

    // Keep the iframe cross-origin by omitting `allow-same-origin`.
    return <iframe
        className='gs-walkthrough-media-svg'
        ref={iframeRef}
        sandbox='allow-scripts'
        srcDoc={createThemedSvgDocument(svg)}
        title={props.alt || walkthroughsLabel}
        data-theme-revision={themeRevision}
    />;
}
