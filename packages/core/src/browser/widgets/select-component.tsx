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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as DOMPurify from 'dompurify';
import { codicon } from './widget';
import { measureTextHeight, measureTextWidth } from '../browser';

import '../../../src/browser/style/select-component.css';

export interface SelectOption {
    value?: string
    label?: string
    separator?: boolean
    disabled?: boolean
    detail?: string
    description?: string
    markdown?: boolean
    userData?: string
}

export interface SelectComponentProps {
    id?: string
    className?: string
    options: readonly SelectOption[]
    defaultValue?: string | number
    onChange?: (option: SelectOption, index: number) => void,
    onBlur?: () => void,
    onFocus?: () => void,
    alignment?: 'left' | 'right';
}

export interface SelectComponentState {
    dimensions?: DOMRect
    selected: number
    original: number
    hover: number
}

export const SELECT_COMPONENT_CONTAINER = 'select-component-container';

export class SelectComponent extends React.Component<SelectComponentProps, SelectComponentState> {
    protected dropdownElement: HTMLElement;
    protected fieldRef = React.createRef<HTMLDivElement>();
    protected dropdownRef = React.createRef<HTMLDivElement>();
    protected mountedListeners: Map<string, EventListenerOrEventListenerObject> = new Map();
    protected optimalWidth = 0;
    protected optimalHeight = 0;

    constructor(props: SelectComponentProps) {
        super(props);
        const selected = this.getInitialSelectedIndex(props);
        this.state = {
            selected,
            original: selected,
            hover: selected
        };

        let list = document.getElementById(SELECT_COMPONENT_CONTAINER);
        if (!list) {
            list = document.createElement('div');
            list.id = SELECT_COMPONENT_CONTAINER;
            list.className = 'theia-select-component-container';
            document.body.appendChild(list);
        }
        this.dropdownElement = list;
    }

    protected getInitialSelectedIndex(props: SelectComponentProps): number {
        let selected = 0;
        if (typeof props.defaultValue === 'number') {
            selected = props.defaultValue;
        } else if (typeof props.defaultValue === 'string') {
            selected = Math.max(props.options.findIndex(e => e.value === props.defaultValue), 0);
        }
        return selected;
    }

    override componentDidUpdate(prevProps: SelectComponentProps): void {
        if (prevProps.defaultValue !== this.props.defaultValue || prevProps.options !== this.props.options) {
            const selected = this.getInitialSelectedIndex(this.props);
            this.setState({
                selected,
                original: selected,
                hover: selected
            });
        }
    }

    get options(): readonly SelectOption[] {
        return this.props.options;
    }

    get value(): string | number | undefined {
        return this.props.options[this.state.selected].value ?? this.state.selected;
    }

    set value(value: string | number | undefined) {
        let index = -1;
        if (typeof value === 'number') {
            index = value;
        } else if (typeof value === 'string') {
            index = this.props.options.findIndex(e => e.value === value);
        }
        if (index >= 0) {
            this.setState({
                selected: index,
                original: index,
                hover: index
            });
        }
    }

    protected get alignLeft(): boolean {
        return this.props.alignment !== 'right';
    }

    protected getOptimalWidth(): number {
        const textWidth = measureTextWidth(this.props.options.map(e => e.label || e.value || '' + (e.detail || '')));
        return Math.ceil(textWidth + 16);
    }

    protected getOptimalHeight(maxWidth?: number): number {
        const firstLine = this.props.options.find(e => e.label || e.value || e.detail);
        if (!firstLine) {
            return 0;
        }
        if (maxWidth) {
            maxWidth = Math.ceil(maxWidth) + 10; // Increase width by 10 due to side padding
        }
        const descriptionHeight = measureTextHeight(this.props.options.map(e => e.description || ''), { maxWidth: `${maxWidth}px` }) + 18;
        const singleLineHeight = measureTextHeight(firstLine.label || firstLine.value || firstLine.detail || '') + 6;
        const optimal = descriptionHeight + singleLineHeight * this.props.options.length;
        return optimal + 20; // Just to be safe, add another 20 pixels here
    }

    protected attachListeners(): void {
        const hide = (event: MouseEvent) => {
            if (!this.dropdownRef.current?.contains(event.target as Node)) {
                this.hide();
            }
        };
        this.mountedListeners.set('scroll', hide);
        this.mountedListeners.set('wheel', hide);

        let parent = this.fieldRef.current?.parentElement;
        while (parent) {
            // Workaround for perfect scrollbar, since using `overflow: hidden`
            // neither triggers the `scroll`, `wheel` nor `blur` event
            if (parent.classList.contains('ps')) {
                parent.addEventListener('ps-scroll-y', hide);
            }
            parent = parent.parentElement;
        }

        for (const [key, listener] of this.mountedListeners.entries()) {
            window.addEventListener(key, listener);
        }
    }

    override componentWillUnmount(): void {
        if (this.mountedListeners.size > 0) {
            const eventListener = this.mountedListeners.get('scroll')!;
            let parent = this.fieldRef.current?.parentElement;
            while (parent) {
                parent.removeEventListener('ps-scroll-y', eventListener);
                parent = parent.parentElement;
            }
            for (const [key, listener] of this.mountedListeners.entries()) {
                window.removeEventListener(key, listener);
            }
        }
    }

    override render(): React.ReactNode {
        const { options } = this.props;
        let { selected } = this.state;
        if (options[selected]?.separator) {
            selected = this.nextNotSeparator('forwards');
        }
        const selectedItemLabel = options[selected]?.label ?? options[selected]?.value;
        return <>
            <div
                id={this.props.id}
                key="select-component"
                ref={this.fieldRef}
                tabIndex={0}
                className={`theia-select-component${this.props.className ? ` ${this.props.className}` : ''}`}
                onClick={e => this.handleClickEvent(e)}
                onBlur={
                    () => {
                        this.hide();
                        this.props.onBlur?.();
                    }
                }
                onFocus={() => this.props.onFocus?.()}
                onKeyDown={e => this.handleKeypress(e)}
            >
                <div key="label" className="theia-select-component-label">{selectedItemLabel}</div>
                <div key="icon" className={`theia-select-component-chevron ${codicon('chevron-down')}`} />
            </div>
            {ReactDOM.createPortal(this.renderDropdown(), this.dropdownElement)}
        </>;
    }

    protected nextNotSeparator(direction: 'forwards' | 'backwards'): number {
        const { options } = this.props;
        const step = direction === 'forwards' ? 1 : -1;
        const length = this.props.options.length;
        let selected = this.state.selected;
        let count = 0;
        do {
            selected = (selected + step) % length;
            if (selected < 0) {
                selected = length - 1;
            }
            count++;
        }
        while (options[selected]?.separator && count < length);
        return selected;
    }

    protected handleKeypress(ev: React.KeyboardEvent<HTMLDivElement>): void {
        if (!this.fieldRef.current) {
            return;
        }
        if (ev.key === 'ArrowUp') {
            const selected = this.nextNotSeparator('backwards');
            this.setState({
                selected,
                hover: selected
            });
        } else if (ev.key === 'ArrowDown') {
            if (this.state.dimensions) {
                const selected = this.nextNotSeparator('forwards');
                this.setState({
                    selected,
                    hover: selected
                });
            } else {
                this.toggleVisibility();
                this.setState({
                    selected: 0,
                    hover: 0,
                });
            }
        } else if (ev.key === 'Enter') {
            if (!this.state.dimensions) {
                this.toggleVisibility();
            } else {
                const selected = this.state.selected;
                this.selectOption(selected, this.props.options[selected]);
            }
        } else if (ev.key === 'Escape' || ev.key === 'Tab') {
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
        if (!this.state.dimensions) {
            const rect = this.fieldRef.current.getBoundingClientRect();
            this.setState({ dimensions: rect });
        } else {
            this.hide();
        }
    }

    protected hide(index?: number): void {
        const selectedIndex = index === undefined ? this.state.original : index;
        this.setState({
            dimensions: undefined,
            selected: selectedIndex,
            original: selectedIndex,
            hover: selectedIndex
        });
    }

    protected renderDropdown(): React.ReactNode {
        if (!this.state.dimensions) {
            return;
        }

        const shellArea = document.getElementById('theia-app-shell')!.getBoundingClientRect();
        const maxWidth = this.alignLeft ? shellArea.width - this.state.dimensions.left : this.state.dimensions.right;
        if (this.mountedListeners.size === 0) {
            // Only attach our listeners once we render our dropdown menu
            this.attachListeners();
            // We can now also calculate the optimal width
            this.optimalWidth = this.getOptimalWidth();
            this.optimalHeight = this.getOptimalHeight(Math.max(this.state.dimensions.width, this.optimalWidth));
        }
        const availableTop = this.state.dimensions.top - shellArea.top;
        const availableBottom = shellArea.top + shellArea.height - this.state.dimensions.bottom;
        // prefer rendering to the bottom unless there is not enough space and more content can be shown to the top
        const invert = availableBottom < this.optimalHeight && (availableBottom - this.optimalHeight) < (availableTop - this.optimalHeight);

        const { options } = this.props;
        const { hover } = this.state;
        const description = options[hover].description;
        const markdown = options[hover].markdown;
        const items = options.map((item, i) => this.renderOption(i, item));
        if (description) {
            let descriptionNode: React.ReactNode | undefined;
            const className = 'theia-select-component-description';
            if (markdown) {
                descriptionNode = <div key="description" className={className}
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(description) }} />; // eslint-disable-line react/no-danger
            } else {
                descriptionNode = <div key="description" className={className}>
                    {description}
                </div>;
            }
            if (invert) {
                items.unshift(descriptionNode);
            } else {
                items.push(descriptionNode);
            }
        }

        return <div key="dropdown" className="theia-select-component-dropdown" style={{
            top: invert ? 'none' : this.state.dimensions.bottom,
            bottom: invert ? shellArea.top - this.state.dimensions.top : 'none',
            left: this.alignLeft ? this.state.dimensions.left : 'none',
            right: this.alignLeft ? 'none' : shellArea.width - this.state.dimensions.right,
            width: Math.min(Math.max(this.state.dimensions.width, this.optimalWidth), maxWidth),
            maxHeight: shellArea.height - (invert ? shellArea.height - this.state.dimensions.bottom : this.state.dimensions.top) - this.state.dimensions.height,
            position: 'absolute'
        }} ref={this.dropdownRef}>
            {items}
        </div>;
    }

    protected renderOption(index: number, option: SelectOption): React.ReactNode {
        if (option.separator) {
            return <div key={index} className="theia-select-component-separator" />;
        }
        const selected = this.state.hover;
        return (
            <div
                key={index}
                className={`theia-select-component-option${index === selected ? ' selected' : ''}`}
                onMouseOver={() => {
                    this.setState({
                        hover: index
                    });
                }}
                onMouseDown={() => {
                    this.selectOption(index, option);
                }}
            >
                <div key="value" className="theia-select-component-option-value">{option.label ?? option.value}</div>
                {option.detail && <div key="detail" className="theia-select-component-option-detail">{option.detail}</div>}
            </div>
        );
    }

    protected selectOption(index: number, option: SelectOption): void {
        this.props.onChange?.(option, index);
        this.hide(index);
    }
}
