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

const RESIZE_SCRIPT = `<script>
new ResizeObserver(() => {
    window.parent.postMessage({ type: 'mcp-app-resize', height: document.documentElement.scrollHeight }, '*');
}).observe(document.documentElement);
</script>`;

export const McpAppFrame: React.FC<McpAppFrameProps> = ({ html, title }) => {
    // eslint-disable-next-line no-null/no-null
    const iframeRef = React.useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = React.useState(200);

    React.useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (iframeRef.current?.contentWindow === event.source &&
                event.data?.type === 'mcp-app-resize' &&
                typeof event.data.height === 'number') {
                setHeight(event.data.height);
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    const srcDoc = html.includes('</body>')
        ? html.replace('</body>', `${RESIZE_SCRIPT}</body>`)
        : `${html}${RESIZE_SCRIPT}`;

    return (
        <div className='theia-mcp-app-container'>
            {title && <div className='theia-mcp-app-title'>{title}</div>}
            <iframe
                ref={iframeRef}
                srcDoc={srcDoc}
                sandbox='allow-scripts'
                style={{ width: '100%', border: 'none', height: `${height}px` }}
                title={title ?? 'MCP App'}
            />
        </div>
    );
};
