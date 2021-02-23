/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { DisposableCollection } from '@theia/core';
import { NotificationManager, NotificationUpdateEvent } from './notifications-manager';
import { NotificationComponent } from './notification-component';

const PerfectScrollbar = require('react-perfect-scrollbar');

export interface NotificationCenterComponentProps {
    readonly manager: NotificationManager;
}

type NotificationCenterComponentState = Pick<NotificationUpdateEvent, Exclude<keyof NotificationUpdateEvent, 'toasts'>>;

export class NotificationCenterComponent extends React.Component<NotificationCenterComponentProps, NotificationCenterComponentState> {

    constructor(props: NotificationCenterComponentProps) {
        super(props);
        this.state = {
            notifications: [],
            visibilityState: 'hidden'
        };
    }

    protected readonly toDisposeOnUnmount = new DisposableCollection();

    async componentDidMount(): Promise<void> {
        this.toDisposeOnUnmount.push(
            this.props.manager.onUpdated(({ notifications, visibilityState }) => {
                this.setState({
                    notifications: notifications,
                    visibilityState
                });
            })
        );
    }
    componentWillUnmount(): void {
        this.toDisposeOnUnmount.dispose();
    }

    render(): React.ReactNode {
        const empty = this.state.notifications.length === 0;
        const title = empty ? 'NO NEW NOTIFICATIONS' : 'NOTIFICATIONS';
        return (
            <div className={`theia-notifications-container theia-notification-center ${this.state.visibilityState === 'center' ? 'open' : 'closed'}`}>
                <div className='theia-notification-center-header'>
                    <div className='theia-notification-center-header-title'>{title}</div>
                    <div className='theia-notification-center-header-actions'>
                        <ul className='theia-notification-actions'>
                            <li className='collapse' title='Hide Notification Center' onClick={this.onHide} />
                            <li className='clear-all' title='Clear All' onClick={this.onClearAll} />
                        </ul>
                    </div>
                </div>
                <PerfectScrollbar className='theia-notification-list-scroll-container'>
                    <div className='theia-notification-list'>
                        {this.state.notifications.map(notification =>
                            <NotificationComponent key={notification.messageId} notification={notification} manager={this.props.manager} />
                        )}
                    </div>
                </PerfectScrollbar>
            </div>
        );
    }

    protected onHide = () => {
        this.props.manager.hideCenter();
    };

    protected onClearAll = () => {
        this.props.manager.clearAll();
    };

}
