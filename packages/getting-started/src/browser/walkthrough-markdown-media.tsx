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

import { MarkdownRenderer, MarkdownRenderOptions } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import type { ILogger } from '@theia/core/lib/common/logger';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import * as React from '@theia/core/shared/react';
import { renderWalkthroughCodeBlock } from './walkthrough-code-block-renderer';
import { resolveMarkdownMediaUris } from './walkthrough-markdown';

/**
 * https://github.com/microsoft/vscode/blob/1.134.0/src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedDetailsRenderer.ts#L34-L169
 * https://github.com/microsoft/vscode/blob/1.134.0/src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedDetailsRenderer.ts#L236-L264
 */
export interface WalkthroughMarkdownMediaProps {
    src: string;
    markdownRenderer: MarkdownRenderer;
    logger: ILogger;
    onLinkClick?: (url: string) => void;
}

export function WalkthroughMarkdownMedia(props: WalkthroughMarkdownMediaProps): React.ReactElement {
    // eslint-disable-next-line no-null/no-null
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        const disposables = new DisposableCollection();
        fetch(props.src)
            .then(response => response.ok ? response.text() : '')
            .then(text => {
                if (!ref.current || !text) {
                    return;
                }
                const options: MarkdownRenderOptions = {
                    codeBlockRenderer: renderWalkthroughCodeBlock,
                    ...(props.onLinkClick && {
                        actionHandler: { callback: props.onLinkClick, disposables },
                    }),
                };
                const result = props.markdownRenderer.render(
                    {
                        value: resolveMarkdownMediaUris(text, props.src),
                        isTrusted: true,
                        supportThemeIcons: true,
                    } as MarkdownString,
                    options,
                );
                disposables.push(result);
                ref.current.replaceChildren(result.element);
            })
            .catch(error => props.logger.warn(`Could not load the walkthrough media '${props.src}'.`, error));
        return () => disposables.dispose();
    }, [props.src, props.markdownRenderer, props.onLinkClick, props.logger]);
    return <div className='gs-walkthrough-media-markdown' ref={ref} />;
}
