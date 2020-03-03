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

import * as React from 'react';
import { DisposableCollection } from '@theia/core';
import { NotificationManager, NotificationUpdateEvent } from './notifications-manager';
import { NotificationComponent } from './notification-component';
import { CorePreferences } from '@theia/core/lib/browser';

export interface NotificationToastsComponentProps {
    readonly manager: NotificationManager;
    readonly corePreferences: CorePreferences;
}

type NotificationToastsComponentState = Pick<NotificationUpdateEvent, Exclude<keyof NotificationUpdateEvent, 'notifications'>>;

export class NotificationToastsComponent extends React.Component<NotificationToastsComponentProps, NotificationToastsComponentState> {

    constructor(props: NotificationToastsComponentProps) {
        super(props);
        this.state = {
            toasts: [],
            visibilityState: 'hidden'
        };
    }

    protected readonly toDisposeOnUnmount = new DisposableCollection();

    async componentDidMount(): Promise<void> {
        this.toDisposeOnUnmount.push(
            this.props.manager.onUpdated(({ toasts, visibilityState }) => {
                visibilityState = this.props.corePreferences['workbench.silentNotifications'] ? 'hidden' : visibilityState;
                this.setState({
                    toasts: toasts.slice(-3),
                    visibilityState
                });
            })
        );
    }
    componentWillUnmount(): void {
        this.toDisposeOnUnmount.dispose();
    }

    render(): React.ReactNode {
        return (
            <div className={`theia-notifications-container theia-notification-toasts ${this.state.visibilityState === 'toasts' ? 'open' : 'closed'}`}>
                <div className='theia-notification-list'>
                    {this.state.toasts.map(notification => <NotificationComponent key={notification.messageId} notification={notification} manager={this.props.manager} />)}
                </div>
            </div>
        );
    }

}
