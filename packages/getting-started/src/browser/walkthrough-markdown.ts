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

import { LinkedText, parseLinkedText } from '@theia/core/lib/common/linked-text';

export interface WalkthroughDescriptionLine {
    readonly text: string;
    readonly linkedText: LinkedText;
}

/**
 * https://github.com/microsoft/vscode/blob/1.134.0/src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedService.ts#L686
 */
export function parseWalkthroughDescription(description: string): WalkthroughDescriptionLine[] {
    return description.split('\n').filter(line => Boolean(line.trim())).map(text => ({ text, linkedText: parseLinkedText(text) }));
}

/** Adapts the remaining VS Code formatted-text syntax to Theia Markdown. */
export function toTheiaWalkthroughMarkdown(description: string): string {
    return description
        .split('\n')
        .filter(line => Boolean(line.trim()))
        .map(line =>
            line
                .replace(/^([\t ]*)-\s+/, '$1\\- ')
                .replace(
                    /<kbd>([^<\n]+)<\/kbd>/g,
                    '[[theia-walkthrough-keycap:$1]]',
                )
                .replace(/\*\*([^*\n]*\S)\s+\*\*/g, '**$1**')
                .replace(/__([^_\n]+)__/g, '*$1*')
                .replace(/``([^`\n]+)``/g, '`$1`'),
        )
        .join('\n\n');
}

/** Theia-only keycap adaptation; VS Code walkthrough formatted text has no `<kbd>` rendering. */
export function renderKeycaps(container: HTMLElement): void {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent?.includes('[[theia-walkthrough-keycap:')) {
            nodes.push(node as Text);
        }
    }
    for (const node of nodes) {
        const content = node.textContent || '';
        const pattern = /\[\[theia-walkthrough-keycap:([^\]\n]+)\]\]/g;
        const fragment = document.createDocumentFragment();
        let offset = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content))) {
            fragment.append(content.substring(offset, match.index));
            const keycap = document.createElement('span');
            keycap.className = 'monaco-keybinding-key';
            keycap.textContent = match[1];
            fragment.append(keycap);
            offset = match.index + match[0].length;
        }
        if (offset) {
            fragment.append(content.substring(offset));
            node.replaceWith(fragment);
        }
    }
}

/**
 * https://github.com/microsoft/vscode/blob/1.134.0/src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedDetailsRenderer.ts#L314-L327
 */
export function resolveMarkdownMediaUris(
    markdown: string,
    source: string,
): string {
    const resolve = (uri: string): string => {
        if (hasUriScheme(uri)) {
            return uri;
        }
        try {
            const sourceUrl = new URL(source, window.location.href);
            // The hosted-plugin endpoint keeps the resource path as one encoded segment. Resolving it through
            // `URL` directly would normalize encoded separators and make relative media from a VSIX unreachable.
            const hostedPlugin = /^(\/hostedPlugin\/[^/]+)\/([^/]+)$/.exec(sourceUrl.pathname);
            if (hostedPlugin) {
                const sourcePath = decodeURIComponent(hostedPlugin[2]);
                const resolvedPath = new URL(uri, `https://walkthrough.invalid/${sourcePath}`).pathname.substring(1);
                return `${sourceUrl.origin}${hostedPlugin[1]}/${encodeURIComponent(resolvedPath)}`;
            }
            return new URL(uri, sourceUrl).toString();
        } catch {
            return uri;
        }
    };
    const image = (attributes: string): string => {
        const src = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i
            .exec(attributes)
            ?.slice(1)
            .find(Boolean);
        const alt =
            /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i
                .exec(attributes)
                ?.slice(1)
                .find(Boolean) || '';
        return src ? `![${alt}](${resolve(src)})` : '';
    };
    return markdown
        .replace(
            /<a\b([^>]*)>\s*<img\b([^>]*)\/?\s*>\s*<\/a>/gi,
            (_match, anchor, attributes) => {
                const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i
                    .exec(anchor)
                    ?.slice(1)
                    .find(Boolean);
                const renderedImage = image(attributes);
                return href && renderedImage
                    ? `[${renderedImage}](${href})`
                    : renderedImage;
            },
        )
        .replace(/<img\b([^>]*)\/?\s*>/gi, (_match, attributes) => image(attributes))
        .replace(
            /(!\[[^\]]*\]\()([^\s)]+)(\))/g,
            (_match, prefix, uri, suffix) =>
                `${prefix}${resolve(uri)}${suffix}`,
        );
}

function hasUriScheme(uri: string): boolean {
    try {
        return Boolean(new URL(uri).protocol);
    } catch {
        return false;
    }
}
