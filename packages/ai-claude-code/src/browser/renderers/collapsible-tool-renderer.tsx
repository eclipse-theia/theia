// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { codicon } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';

interface CollapsibleToolRendererProps {
    compactHeader: ReactNode;
    expandedContent?: ReactNode;
    onHeaderClick?: () => void;
    headerStyle?: React.CSSProperties;
    defaultExpanded?: boolean;
}

export const CollapsibleToolRenderer: React.FC<CollapsibleToolRendererProps> = ({
    compactHeader,
    expandedContent,
    onHeaderClick,
    headerStyle,
    defaultExpanded = false
}) => {
    const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

    const hasExpandableContent = expandedContent !== undefined;

    const handleHeaderClick = (event: React.MouseEvent) => {
        // Check if the clicked element or any of its parents has the 'clickable' class
        // If so, don't trigger collapse/expand behavior
        const target = event.target as HTMLElement;
        if (target.closest('.clickable-element')) {
            onHeaderClick?.();
            return;
        }

        // Normal header click behavior
        if (hasExpandableContent) {
            setIsExpanded(!isExpanded);
        }
        onHeaderClick?.();
    };

    return (
        <div className="claude-code-tool container">
            <div
                className={`claude-code-tool header${hasExpandableContent ? ' expandable' : ''}`}
                onClick={handleHeaderClick}
                style={{
                    cursor: hasExpandableContent || onHeaderClick ? 'pointer' : 'default',
                    ...headerStyle
                }}
            >
                {hasExpandableContent && (
                    <span className={`${codicon(isExpanded ? 'chevron-down' : 'chevron-right')} claude-code-tool expand-icon`} />
                )}
                {compactHeader}
            </div>
            {hasExpandableContent && isExpanded && (
                <div className="claude-code-tool expanded-content">
                    {expandedContent}
                </div>
            )}
        </div>
    );
};
