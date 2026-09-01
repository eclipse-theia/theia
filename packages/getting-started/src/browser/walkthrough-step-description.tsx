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

import {
    MarkdownRenderer,
    MarkdownRenderOptions,
} from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import * as React from '@theia/core/shared/react';
import { WalkthroughLabel } from './walkthrough-label';
import {
    parseWalkthroughDescription,
    renderKeycaps,
    toTheiaWalkthroughMarkdown,
} from './walkthrough-markdown';

/**
 * https://github.com/microsoft/vscode/blob/1.134.0/src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts#L1441-L1492
 */
export interface WalkthroughStepDescriptionProps {
    description: string;
    markdownRenderer: MarkdownRenderer;
    onLinkClick?: (url: string) => void;
}

export function WalkthroughStepDescription(props: WalkthroughStepDescriptionProps): React.ReactElement {
    const lines = React.useMemo(() => parseWalkthroughDescription(props.description), [props.description]);
    return <div className='gs-walkthrough-step-description'>
        {lines.map((line, index) => {
            const nodes = line.linkedText.nodes;
            const link = nodes.length === 1 && typeof nodes[0] !== 'string' ? nodes[0] : undefined;
            if (link) {
                return (
                    <button
                        key={index}
                        type='button'
                        className='theia-button gs-walkthrough-command-button'
                        title={link.title}
                        onClick={() => props.onLinkClick?.(link.href)}>
                        <WalkthroughLabel label={link.label} />
                    </button>
                );
            }
            return <WalkthroughMarkdownLine key={index} text={line.text} markdownRenderer={props.markdownRenderer} onLinkClick={props.onLinkClick} />;
        })}
    </div>;
}

interface WalkthroughMarkdownLineProps {
    text: string;
    markdownRenderer: MarkdownRenderer;
    onLinkClick?: (url: string) => void;
}

function WalkthroughMarkdownLine(props: WalkthroughMarkdownLineProps): React.ReactElement {
    // eslint-disable-next-line no-null/no-null
    const ref = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (!ref.current) {
            return undefined;
        }
        const options: MarkdownRenderOptions | undefined = props.onLinkClick
            ? {
                actionHandler: {
                    callback: props.onLinkClick,
                    disposables: new DisposableCollection(),
                },
            }
            : undefined;
        const result = props.markdownRenderer.render(
            {
                value: toTheiaWalkthroughMarkdown(props.text),
                isTrusted: true,
                supportThemeIcons: true,
            } as MarkdownString,
            options,
        );
        renderKeycaps(result.element);
        ref.current.replaceChildren(result.element);
        return () => result.dispose();
    }, [props.text, props.markdownRenderer, props.onLinkClick]);
    return <div ref={ref} />;
}
