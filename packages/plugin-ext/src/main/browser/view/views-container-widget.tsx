/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { ViewContainer, View } from '../../../common';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import * as React from 'react';

export class ViewContainerSection extends React.Component<View, any> {

    constructor(protected view: View) {
        super(view);

        this.state = {opened: 'opened'};
    }

    public handleOnClick() {
        if ('opened' === this.state.opened) {
            this.setState({opened: 'closed'});
        } else {
            this.setState({opened: 'opened'});
        }
    }

    public render() {
        const title =
            <div className='theia-views-container-section-title' onClick={e => this.handleOnClick()}>
                <div className='theia-views-container-section-control' role={this.state.opened}></div>
                <div className='theia-views-container-section-label'>{this.view.name}</div>
            </div>;

        const content =
            <div className='theia-views-container-section-content' role={this.state.opened}>{this.props.name}</div>;

        return <div key={this.view.id} id={this.view.id} className='theia-views-container-section'>
                    {title}
                    {content}
                </div>;
    }
}

export class ViewsContainerWidget extends ReactWidget {

    constructor(protected viewContainer: ViewContainer,
                protected views: View[]) {
        super();

        this.id = `views-container-widget-${viewContainer.id}`;
        this.title.closable = true;
        this.title.caption = this.title.label = viewContainer.title;

        this.addClass('theia-views-container');

        this.update();
    }

    protected render(): React.ReactNode {
        const list = this.views.map(view => <ViewContainerSection key={view.id} id={view.id} name={view.name} />);

        return <React.Fragment>
                <div className='theia-views-container-title'>{this.viewContainer.title}</div>
                {...list}
            </React.Fragment>;
    }

}
