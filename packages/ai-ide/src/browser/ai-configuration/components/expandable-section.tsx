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
import * as React from '@theia/core/shared/react';
import { codicon } from '@theia/core/lib/browser';

export interface ExpandableSectionProps {
    title: React.ReactNode;
    isExpanded: boolean;
    onToggle: () => void;
    children: React.ReactNode;
    className?: string;
}

/**
 * A collapsible section with a chevron icon and expandable content.
 */
export const ExpandableSection: React.FC<ExpandableSectionProps> = ({
    title,
    isExpanded,
    onToggle,
    children,
    className
}) => (
    <div className={`ai-expandable-section ${className || ''}`}>
        <div
            className={`ai-expandable-section-header ${isExpanded ? 'expanded' : ''}`}
            onClick={onToggle}
        >
            <span className='ai-expandable-section-icon'>
                <i className={codicon(isExpanded ? 'chevron-down' : 'chevron-right')} />
            </span>
            <div className='ai-expandable-section-title'>{title}</div>
        </div>
        {isExpanded && (
            <div className='ai-expandable-section-content'>{children}</div>
        )}
    </div>
);
