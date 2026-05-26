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

import { Disposable } from '../../common';
import { MarkdownString } from '../../common/markdown-rendering/markdown-string';
import URI from '../../common/uri';
import { open, OpenerService } from '../opener-service';

/**
 * Wires up anchor clicks inside a rendered markdown element so that they are routed
 * through the {@link OpenerService} instead of relying on default browser navigation.
 * Honors {@link MarkdownString.isTrusted} for `command:` URIs.
 *
 * Also sets the `title` attribute on each anchor to its `href` (when no title is set)
 * so users can hover to see the link target.
 *
 * @returns a {@link Disposable} that removes the click listener.
 */
export function wireMarkdownLinkHandler(
    root: HTMLElement,
    source: MarkdownString,
    openerService: OpenerService
): Disposable {
    for (const anchor of root.querySelectorAll('a')) {
        const href = anchor.getAttribute('href');
        if (href && !anchor.hasAttribute('title')) {
            anchor.setAttribute('title', href);
        }
    }
    const handleClick = async (event: MouseEvent) => {
        const href = (event.target as HTMLElement | null)?.closest('a')?.getAttribute('href');
        if (!href) {
            return;
        }
        event.preventDefault();
        const uri = new URI(href);
        if (uri.scheme === 'command' && !MarkdownString.isCommandAllowed(source.isTrusted, uri.path.toString())) {
            return;
        }
        try {
            await open(openerService, uri);
        } catch (e) {
            console.error(`Failed to open '${uri.toString()}':`, e);
        }
    };
    root.addEventListener('click', handleClick);
    return Disposable.create(() => root.removeEventListener('click', handleClick));
}
