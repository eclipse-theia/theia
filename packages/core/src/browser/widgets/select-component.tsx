// *****************************************************************************
// Copyright (C) 2022 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as DOMPurify from 'dompurify';
import * as markdownit from 'markdown-it';
import { Event as TheiaEvent } from '../../common/event';
import { codicon } from './widget';

import '../../../src/browser/style/select-component.css';

const markdownRenderer = markdownit();

export interface SelectOption {
    value?: string
    label?: string
    separator?: boolean
    disabled?: boolean
    detail?: string
    description?: string
    markdownDescription?: string
    onSelected?: () => void
}

export interface SelectComponentProps {
    options: SelectOption[]
    selected: number
    onSelected?: (index: number, option: SelectOption) => void
    onDidChange?: TheiaEvent<number>
}

export type SelectComponentDropdownDimensions = {
    top: number
    left: number
    width: number
} | 'hidden';

export interface SelectComponentState {
    dimensions: SelectComponentDropdownDimensions
    selected: number
}

export const SELECT_COMPONENT_CONTAINER = 'select-component-container';

export class SelectComponent extends React.Component<SelectComponentProps, SelectComponentState> {
    protected dropdownElement: HTMLElement;
    protected fieldRef = React.createRef<HTMLDivElement>();
    protected mountedListeners: Map<keyof DocumentEventMap, EventListenerOrEventListenerObject> = new Map();

    constructor(props: SelectComponentProps) {
        super(props);
        this.state = {
            dimensions: 'hidden',
            selected: props.selected
        };

        let list = document.getElementById(SELECT_COMPONENT_CONTAINER);
        if (!list) {
            list = document.createElement('div');
            list.id = SELECT_COMPONENT_CONTAINER;
            document.body.appendChild(list);
        }
        this.dropdownElement = list;
    }

    override componentDidMount(): void {
        const hide = () => this.hide();
        this.mountedListeners.set('click', hide);
        this.mountedListeners.set('scroll', hide);
        this.mountedListeners.set('wheel', hide);

        for (const [key, listener] of this.mountedListeners.entries()) {
            window.addEventListener(key, listener);
        }
    }

    override componentWillUnmount(): void {
        for (const [key, listener] of this.mountedListeners.entries()) {
            window.removeEventListener(key, listener);
        }
    }

    override render(): React.ReactNode {
        const { options } = this.props;
        const { selected } = this.state;
        const selectedItemLabel = options[selected].label ?? options[selected].value;
        return <>
            <div
                ref={this.fieldRef}
                tabIndex={0}
                className="theia-select-component"
                onClick={e => this.handleClickEvent(e)}
                onKeyDown={e => this.handleKeypress(e)}
            >
                <div className="theia-select-component-label">{selectedItemLabel}</div>
                <div className={`theia-select-component-chevron ${codicon('chevron-down')}`} />
            </div>
            {ReactDOM.createPortal(this.renderDropdown(), this.dropdownElement)}
        </>;
    }

    protected handleKeypress(ev: React.KeyboardEvent<HTMLDivElement>): void {
        if (!this.fieldRef.current) {
            return;
        }
        if (ev.key === 'ArrowUp') {
            let selected = this.state.selected;
            if (selected <= 0) {
                selected = this.props.options.length - 1;
            } else {
                selected--;
            }
            this.setState({
                selected
            });
        } else if (ev.key === 'ArrowDown') {
            const selected = (this.state.selected + 1) % this.props.options.length;
            this.setState({
                selected
            });
        } else if (ev.key === 'Enter') {
            if (this.state.dimensions === 'hidden') {
                this.toggleVisibility();
            } else {
                const selected = this.state.selected;
                this.selectOption(selected, this.props.options[selected]);
            }
        } else if (ev.key === 'Escape') {
            this.hide();
        }
        ev.stopPropagation();
        ev.nativeEvent.stopImmediatePropagation();
    }

    protected handleClickEvent(event: React.MouseEvent<HTMLElement>): void {
        this.toggleVisibility();
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
    }

    protected toggleVisibility(): void {
        if (!this.fieldRef.current) {
            return;
        }
        if (this.state.dimensions === 'hidden') {
            const rect = this.fieldRef.current.getBoundingClientRect();
            this.setState({
                dimensions: {
                    top: rect.top + rect.height,
                    left: rect.left,
                    width: rect.width
                },
            });
        } else {
            this.hide();
        }
    }

    protected hide(): void {
        this.setState({ dimensions: 'hidden' });
    }

    protected renderDropdown(): React.ReactNode {
        if (this.state.dimensions === 'hidden') {
            return;
        }
        const { options } = this.props;
        const { selected } = this.state;
        const description = selected !== undefined && options[selected].description;
        const markdownDescription = selected !== undefined && options[selected].markdownDescription;
        return <div className="theia-select-component-dropdown" style={{
            top: this.state.dimensions.top,
            left: this.state.dimensions.left,
            width: this.state.dimensions.width,
            position: 'absolute'
        }}>
            {
                options.map((item, i) => this.renderOption(i, item))
            }
            {markdownDescription && (
                <div className="theia-select-component-description"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(markdownRenderer.renderInline(markdownDescription)) }} /> // eslint-disable-line react/no-danger
            )}
            {description && !markdownDescription && (
                <div className="theia-select-component-description">
                    {description}
                </div>
            )}
        </div>;
    }

    protected renderOption(index: number, option: SelectOption): React.ReactNode {
        if (option.separator) {
            return <div className="theia-select-component-separator" />;
        }
        const selected = this.state.selected;
        return (
            <div
                key={option.value}
                className={`theia-select-component-option${index === selected ? ' selected' : ''}`}
                onMouseOver={() => {
                    this.setState({
                        selected: index
                    });
                }}
                onClick={() => {
                    this.selectOption(index, option);
                }}
            >
                <div className="theia-select-component-option-value">{option.label ?? option.value}</div>
                {option.detail && <div className="theia-select-component-option-detail">{option.detail}</div>}
            </div>
        );
    }

    protected selectOption(index: number, option: SelectOption): void {
        option.onSelected?.();
        this.props.onSelected?.(index, option);
        this.hide();
    }
}
