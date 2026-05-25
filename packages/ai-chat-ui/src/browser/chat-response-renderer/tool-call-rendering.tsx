// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { nls } from '@theia/core/lib/common';
import { codicon } from '@theia/core/lib/browser';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';

export interface CopyButtonProps {
    text: string;
    clipboardService: ClipboardService;
}

export const CopyButton: React.FC<CopyButtonProps> = ({ text, clipboardService }) => {
    const handleCopy = React.useCallback(() => {
        clipboardService.writeText(text);
    }, [text, clipboardService]);

    return (
        <button
            className="tool-call copy-button"
            onClick={handleCopy}
            title={nls.localizeByDefault('Copy')}
        >
            <span className={codicon('copy')} />
        </button>
    );
};

export interface MetaRowProps {
    icon: string;
    label: string;
    children: React.ReactNode;
}

export const MetaRow: React.FC<MetaRowProps> = ({ icon, label, children }) => (
    <div className="tool-call meta-row" title={label}>
        <span className={codicon(icon)} />
        <span>{children}</span>
    </div>
);

export interface OutputBoxProps {
    title: string;
    output?: string;
    clipboardService: ClipboardService;
}

export const OutputBox: React.FC<OutputBoxProps> = ({ title, output, clipboardService }) => (
    <div className="tool-call output-box">
        <div className="tool-call output-header">
            <span className={codicon('output')} />
            {title}
            {output && <CopyButton text={output} clipboardService={clipboardService} />}
        </div>
        {output ? (
            <pre className="tool-call output">{output}</pre>
        ) : (
            <div className="tool-call no-output">
                {nls.localize('theia/ai-chat-ui/noOutput', 'No output')}
            </div>
        )}
    </div>
);

export function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    if (ms < 60000) {
        return `${(ms / 1000).toFixed(1)}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
