// *****************************************************************************
// Copyright (C) 2026 Ericsson and others.
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

import * as React from '@theia/core/shared/react';

export interface McpAppFrameProps {
    html: string;
    title?: string;
}

/** Maximum height the iframe can grow to (px). Consistent with the mermaid renderer viewport cap. */
const MAX_HEIGHT = 800;

const CSP_META = `<meta http-equiv="Content-Security-Policy" ` +
    `content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none';">`;

const RESIZE_SCRIPT = `<script>
new ResizeObserver(() => {
    window.parent.postMessage({ type: 'mcp-app-resize', height: document.documentElement.scrollHeight }, '*');
}).observe(document.documentElement);
</script>`;

/**
 * Builds the `srcDoc` for the sandboxed iframe by injecting a CSP meta tag and a resize-reporting script.
 * Exported for testability.
 */
export function buildSrcDoc(html: string): string {
    let doc = html;
    // Inject CSP meta tag into <head> if present, otherwise prepend it.
    if (doc.includes('<head>')) {
        doc = doc.replace('<head>', `<head>${CSP_META}`);
    } else if (doc.includes('<html')) {
        doc = doc.replace(/(<html[^>]*>)/, `$1<head>${CSP_META}</head>`);
    } else {
        doc = `${CSP_META}${doc}`;
    }
    // Inject resize script before </body> if present, otherwise append it.
    if (doc.includes('</body>')) {
        doc = doc.replace('</body>', `${RESIZE_SCRIPT}</body>`);
    } else {
        doc = `${doc}${RESIZE_SCRIPT}`;
    }
    return doc;
}

export const McpAppFrame: React.FC<McpAppFrameProps> = ({ html, title }) => {
    // eslint-disable-next-line no-null/no-null
    const iframeRef = React.useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = React.useState(200);

    React.useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (iframeRef.current?.contentWindow === event.source &&
                event.data?.type === 'mcp-app-resize' &&
                typeof event.data.height === 'number') {
                const h = event.data.height;
                if (Number.isFinite(h) && h > 0) {
                    setHeight(Math.min(h, MAX_HEIGHT));
                }
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    const srcDoc = buildSrcDoc(html);

    return (
        <div className='theia-mcp-app-container'>
            {title && <div className='theia-mcp-app-title'>{title}</div>}
            <iframe
                ref={iframeRef}
                srcDoc={srcDoc}
                sandbox='allow-scripts'
                allow=''
                className='theia-mcp-app-iframe'
                style={{ height: `${height}px` }}
                title={title ?? 'MCP App'}
            />
        </div>
    );
};
