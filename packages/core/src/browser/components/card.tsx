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

import * as React from 'react';

export interface CardActionButton {
    /** Icon class (e.g., codicon) */
    iconClass: string;
    /** Accessible label and tooltip */
    title: string;
    /** Called when the button is clicked; receives the mouse event */
    onClick: (e: React.MouseEvent) => void;
}

export interface CardProps {
    /** Icon class (e.g., codicon) */
    icon?: string;
    /** Primary text */
    title: string;
    /** Secondary text (e.g., timestamp) */
    subtitle?: string;
    /** If provided, card is interactive */
    onClick?: () => void;
    /** Additional CSS class */
    className?: string;
    /** Child content */
    children?: React.ReactNode;
    /** Maximum number of lines for title (default: 4) */
    maxTitleLines?: number;
    /** Tooltip for title */
    titleTooltip?: string;
    /**
     * Optional action buttons shown in the card footer on hover.
     * When provided, `subtitle` is rendered as fading text beneath the title
     * and is replaced by the action buttons on hover.
     */
    actionButtons?: CardActionButton[];
}

/**
 * A reusable component for presentation of a card providing a capsule summary of some
 * data, article, or other object. Cards provide interaction behaviour when the `onClick`
 * call-back prop is supplied.
 */
export const Card = React.memo(function Card(props: CardProps): React.ReactElement {
    const {
        icon,
        title,
        subtitle,
        onClick,
        className,
        children,
        maxTitleLines = 4,
        titleTooltip,
        actionButtons
    } = props;

    const isInteractive = onClick !== undefined;

    const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick();
        }
    }, [onClick]);

    const cardClasses = [
        'theia-Card',
        isInteractive && 'theia-Card-interactive',
        className
    ].filter(Boolean).join(' ');

    const titleStyle: React.CSSProperties = {
        WebkitLineClamp: maxTitleLines
    };

    return (
        <div
            className={cardClasses}
            onClick={onClick}
            role={isInteractive ? 'button' : undefined}
            tabIndex={isInteractive ? 0 : undefined}
            onKeyDown={isInteractive ? handleKeyDown : undefined}
        >
            {icon && (
                <div className={`theia-Card-icon ${icon}`}></div>
            )}
            <div className="theia-Card-content">
                <div
                    className="theia-Card-title"
                    title={titleTooltip}
                    style={titleStyle}
                >
                    {title}
                </div>
                {actionButtons ? (
                    <div className="theia-Card-footer">
                        {subtitle && <span className="theia-Card-footer-time">{subtitle}</span>}
                        <div className="theia-Card-footer-actions">
                            {actionButtons.map((btn, i) => (
                                <button
                                    key={i}
                                    className={`theia-Card-action-btn ${btn.iconClass}`}
                                    title={btn.title}
                                    aria-label={btn.title}
                                    onClick={btn.onClick}
                                />
                            ))}
                        </div>
                    </div>
                ) : (
                    subtitle && (
                        <div className="theia-Card-subtitle">
                            {subtitle}
                        </div>
                    )
                )}
                {children}
            </div>
        </div>
    );
});
