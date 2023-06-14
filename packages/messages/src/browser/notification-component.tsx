// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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
import * as DOMPurify from '@theia/core/shared/dompurify';
import { NotificationManager, Notification } from './notifications-manager';
import { codicon } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';

export interface NotificationComponentProps {
    readonly manager: NotificationManager;
    readonly notification: Notification;
}

export class NotificationComponent extends React.Component<NotificationComponentProps> {

    constructor(props: NotificationComponentProps) {
        super(props);
        this.state = {};
    }

    protected onClear = (event: React.MouseEvent) => {
        if (event.target instanceof HTMLElement) {
            const messageId = event.target.dataset.messageId;
            if (messageId) {
                this.props.manager.clear(messageId);
            }
        }
    };

    protected onToggleExpansion = (event: React.MouseEvent) => {
        if (event.target instanceof HTMLElement) {
            const messageId = event.target.dataset.messageId;
            if (messageId) {
                this.props.manager.toggleExpansion(messageId);
            }
        }
    };

    protected onAction = (event: React.MouseEvent) => {
        if (event.target instanceof HTMLElement) {
            const messageId = event.target.dataset.messageId;
            const action = event.target.dataset.action;
            if (messageId && action) {
                this.props.manager.accept(messageId, action);
            }
        }
    };

    protected onMessageClick = (event: React.MouseEvent) => {
        if (event.target instanceof HTMLAnchorElement) {
            event.stopPropagation();
            event.preventDefault();
            const link = event.target.href;
            this.props.manager.openLink(link);
        }
    };

    override render(): React.ReactNode {
        const { messageId, message, type, progress, collapsed, expandable, source, actions } = this.props.notification;
        const isProgress = type === 'progress' || typeof progress === 'number';
        const icon = type === 'progress' ? 'info' : type;
        return (<div key={messageId} className='theia-notification-list-item-container'>
            <div className='theia-notification-list-item' tabIndex={0}>
                <div className={`theia-notification-list-item-content ${collapsed ? 'collapsed' : ''}`}>
                    <div className='theia-notification-list-item-content-main'>
                        <div className={`theia-notification-icon ${codicon(icon)} ${icon}`} />
                        <div className='theia-notification-message'>
                            <span
                                // eslint-disable-next-line react/no-danger
                                dangerouslySetInnerHTML={{
                                    __html: DOMPurify.sanitize(message, {
                                        ALLOW_UNKNOWN_PROTOCOLS: true // DOMPurify usually strips non http(s) links from hrefs
                                    })
                                }}
                                onClick={this.onMessageClick}
                            />
                        </div>
                        <ul className='theia-notification-actions'>
                            {expandable && (
                                <li className={codicon('chevron-down', true) + (collapsed ? ' expand' : ' collapse')} title={collapsed ? 'Expand' : 'Collapse'}
                                    data-message-id={messageId} onClick={this.onToggleExpansion} />
                            )}
                            {!isProgress && (<li className={codicon('close', true)} title={nls.localizeByDefault('Clear')} data-message-id={messageId}
                                onClick={this.onClear} />)}
                        </ul>
                    </div>
                    {(source || !!actions.length) && (
                        <div className='theia-notification-list-item-content-bottom'>
                            <div className='theia-notification-source'>
                                {source && (<span>{source}</span>)}
                            </div>
                            <div className='theia-notification-buttons'>
                                {actions && actions.map((action, index) => (
                                    <button key={messageId + `-action-${index}`} className='theia-button'
                                        data-message-id={messageId} data-action={action}
                                        onClick={this.onAction}>
                                        {action}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                {isProgress && (
                    <div className='theia-notification-item-progress'>
                        <div className={`theia-notification-item-progressbar ${progress ? 'determinate' : 'indeterminate'}`}
                            style={{ width: `${progress ?? '100'}%` }} />
                    </div>
                )}
            </div>
        </div>);
    }

}
