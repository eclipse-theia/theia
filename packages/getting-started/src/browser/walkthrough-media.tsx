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

import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import type { ThemeService } from '@theia/core/lib/browser/theming';
import type { ILogger } from '@theia/core/lib/common/logger';
import * as React from '@theia/core/shared/react';
import { WalkthroughStep } from '../common/walkthrough-types';
import { WalkthroughImageMedia } from './walkthrough-image-media';
import { WalkthroughMarkdownMedia } from './walkthrough-markdown-media';
import { WalkthroughSvgMedia } from './walkthrough-svg-media';

export interface WalkthroughMediaProps {
    step: WalkthroughStep;
    markdownRenderer: MarkdownRenderer;
    themeService: ThemeService;
    logger: ILogger;
    onLinkClick?: (url: string) => void;
}

/**
 * https://github.com/microsoft/vscode/blob/1.134.0/src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedService.ts#L344-L401
 */
export function WalkthroughMedia({
    step,
    markdownRenderer,
    themeService,
    logger,
    onLinkClick,
}: WalkthroughMediaProps): React.ReactElement | null {
    const media = step.media;
    if (!media) {
        // eslint-disable-next-line no-null/no-null
        return null;
    }
    if ('svg' in media) {
        return (
            <WalkthroughSvgMedia
                src={media.svg}
                alt={media.altText || ''}
                themeService={themeService}
                onLinkClick={onLinkClick}
            />
        );
    }
    if ('image' in media) {
        return (
            <WalkthroughImageMedia
                image={media.image}
                alt={media.altText || ''}
                themeService={themeService}
            />
        );
    }
    return (
        <WalkthroughMarkdownMedia
            src={media.markdown}
            markdownRenderer={markdownRenderer}
            logger={logger}
            onLinkClick={onLinkClick}
        />
    );
}
