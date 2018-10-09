/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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
import { ReactWidget, Widget, EXPANSION_TOGGLE_CLASS, COLLAPSED_CLASS, MessageLoop, Message } from './widgets';
import { Disposable } from '../common/disposable';

export class ViewContainer extends ReactWidget {

    protected readonly widgets = new Set<Widget>();

    constructor() {
        super();
        this.addClass('theia-view-container');
    }

    protected render(): React.ReactNode {
        const parts: React.ReactNode[] = [];
        this.widgets.forEach(widget => parts.push(this.renderPart(widget)));
        return <React.Fragment>{parts}</React.Fragment>;
    }

    protected renderPart(widget: Widget): React.ReactNode {
        return <ViewContainerPart key={widget.id} widget={widget} />;
    }

    addWidget(widget: Widget): Disposable {
        if (this.widgets.has(widget)) {
            return Disposable.NULL;
        }
        this.widgets.add(widget);
        this.update();
        return Disposable.create(() => this.removeWidget(widget));
    }

    removeWidget(widget: Widget): boolean {
        if (!this.widgets.delete(widget)) {
            return false;
        }
        this.update();
        return true;
    }

    protected onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        this.widgets.forEach(widget => MessageLoop.sendMessage(widget, Widget.ResizeMessage.UnknownSize));
    }

    protected onUpdateRequest(msg: Message): void {
        this.widgets.forEach(widget => widget.update());
        super.onUpdateRequest(msg);
    }

    onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const widget = this.widgets.values().next().value;
        if (widget) {
            widget.activate();
        }
    }

}

export class ViewContainerPart extends React.Component<ViewContainerPart.Props, ViewContainerPart.State> {

    constructor(props: ViewContainerPart.Props) {
        super(props);
        this.state = {
            expanded: true
        };
    }

    protected detaching = false;
    componentWillUnmount(): void {
        const { widget } = this.props;
        if (widget.isAttached) {
            this.detaching = true;
            MessageLoop.sendMessage(widget, Widget.Msg.BeforeDetach);
        }
    }

    render(): React.ReactNode {
        const { widget } = this.props;
        const toggleClassNames = [EXPANSION_TOGGLE_CLASS];
        if (!this.state.expanded) {
            toggleClassNames.push(COLLAPSED_CLASS);
        }
        const toggleClassName = toggleClassNames.join(' ');
        return <div className='theia-view-container-part'>
            <div className='theia-header theia-view-container-part-head'
                title={widget.title.caption}
                onClick={this.toggle}>
                <span className={toggleClassName} />
                <span className='label'>{widget.title.label}</span>
                {this.state.expanded && this.renderToolbar()}
            </div>
            {this.state.expanded && <div className='theia-view-container-part-body' ref={this.setRef} />}
        </div>;
    }
    protected renderToolbar(): React.ReactNode {
        const { widget } = this.props;
        if (!ViewContainerPartWidget.is(widget)) {
            return undefined;
        }
        return < React.Fragment >
            {widget.toolbarElements.map((element, key) => this.renderToolbarElement(key, element))}
        </React.Fragment >;
    }
    protected renderToolbarElement(key: number, element: ViewContainerPartToolbarElement): React.ReactNode {
        if (element.enabled === false) {
            return undefined;
        }
        const { className, tooltip, execute } = element;
        const classNames = ['element'];
        if (className) {
            classNames.push(className);
        }
        return <span key={key}
            title={tooltip}
            className={classNames.join(' ')}
            onClick={async e => {
                e.stopPropagation();
                e.preventDefault();
                await execute();
                this.forceUpdate();
            }} />;
    }

    protected toggle = () => {
        if (this.state.expanded) {
            Widget.detach(this.props.widget);
        }
        this.setState({
            expanded: !this.state.expanded
        });
    }

    protected ref: HTMLElement | undefined;
    protected setRef = (ref: HTMLElement | null) => {
        const { widget } = this.props;
        if (ref) {
            MessageLoop.sendMessage(widget, Widget.Msg.BeforeAttach);
            // tslint:disable:no-null-keyword
            ref.insertBefore(widget.node, null);
            MessageLoop.sendMessage(widget, Widget.Msg.AfterAttach);
            widget.update();
        } else if (this.detaching)  {
            this.detaching = false;
            MessageLoop.sendMessage(widget, Widget.Msg.AfterDetach);
        }
    }

}
export namespace ViewContainerPart {
    export interface Props {
        widget: Widget
    }
    export interface State {
        expanded: boolean
    }
}

export interface ViewContainerPartToolbarElement {
    /** default true */
    readonly enabled?: boolean
    readonly className: string
    readonly tooltip: string
    // tslint:disable-next-line:no-any
    execute(): any
}

export interface ViewContainerPartWidget extends Widget {
    readonly toolbarElements: ViewContainerPartToolbarElement[];
}
export namespace ViewContainerPartWidget {
    export function is(widget: Widget | undefined): widget is ViewContainerPartWidget {
        return !!widget && ('toolbarElements' in widget);
    }
}
