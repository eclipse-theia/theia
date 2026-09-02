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

import type { ThemeType } from '@theia/core/lib/common/theme';
import { isObject } from '@theia/core/lib/common/types';

export type WalkthroughImage = string | {
    dark: string;
    light: string;
    hc: string;
    hcLight: string;
};

/**
 * https://github.com/microsoft/vscode/blob/1.134.0/src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedService.ts#L695-L729
 */
export function resolveWalkthroughImageSource(image: WalkthroughImage, themeType: ThemeType): string {
    if (typeof image === 'string') {
        return image;
    }
    switch (themeType) {
        case 'light': return image.light;
        case 'hc': return image.hc;
        case 'hcLight': return image.hcLight;
        default: return image.dark;
    }
}

/**
 * https://github.com/microsoft/vscode/blob/1.134.0/src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedDetailsRenderer.ts#L172-L234
 */
export function createThemedSvgDocument(svg: string): string {
    const variables = [...new Set(svg.match(/--vscode-[A-Za-z0-9-]+/g) || [])];
    const rootStyle = getComputedStyle(document.documentElement);
    const declarations = variables
        .map(variable => {
            const theiaVariable = variable.replace('--vscode-', '--theia-');
            const value = rootStyle.getPropertyValue(theiaVariable).trim();
            return value && `${variable}: ${value};`;
        })
        .filter(Boolean)
        .join('');
    // XXX: Install tobermory.es6-string-html VSIX to see HTML syntax highlight.
    return /* html */ `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
    <style>
        html, body { height: 100%; margin: 0; overflow: hidden; }
        :root { ${declarations} }
        svg {
            height: 100%;
            left: 50%;
            max-width: 530px;
            min-width: 350px;
            position: absolute;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 80%;
        }
    </style>
</head>
<body>
    ${removeSvgScripts(svg)}
    <script>
        document.addEventListener('click', event => {
            let element = event.target;
            while (element instanceof Element) {
                const href = element.getAttribute('href') || element.getAttribute('xlink:href');
                if (href) {
                    event.preventDefault();
                    event.stopPropagation();
                    window.parent.postMessage({ type: 'theia-walkthrough-svg-link', href }, '*');
                    return;
                }
                element = element.parentElement;
            }
        });
    </script>
</body>
</html>`;
}

export function removeSvgScripts(svg: string): string {
    return svg
        .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
        .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

export function isSvgLinkMessage(value: unknown): value is { type: 'theia-walkthrough-svg-link'; href: string } {
    return isObject(value)
        && (value as { type?: unknown }).type === 'theia-walkthrough-svg-link'
        && typeof (value as { href?: unknown }).href === 'string';
}

// allows walkthrough commands and links while refusing executable URI schemes.
export function isSafeWalkthroughLink(href: string): boolean {
    return /^(command|https?|mailto):/i.test(href);
}
