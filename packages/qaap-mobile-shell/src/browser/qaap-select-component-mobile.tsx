// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as DOMPurify from 'dompurify';
import { codicon } from '@theia/core/lib/browser/widgets/widget';
import { matchesMobileNarrowViewport } from '@theia/core/lib/browser/shell/mobile-layout-state';
import {
    SelectComponent,
    SelectOption,
} from '@theia/core/lib/browser/widgets/select-component';

export type QaapSelectComponentOverlayClipBottomProvider = (fallbackBottom: number) => number;

let overlayClipBottomProvider: QaapSelectComponentOverlayClipBottomProvider | undefined;

export function setQaapSelectComponentOverlayClipBottomProvider(
    provider: QaapSelectComponentOverlayClipBottomProvider | undefined,
): void {
    overlayClipBottomProvider = provider;
}

const MOBILE_PATCHED_METHODS = [
    'attachListeners',
    'componentWillUnmount',
    'render',
    'renderDropdown',
    'renderOption',
] as const;

type MobilePatchedMethod = typeof MOBILE_PATCHED_METHODS[number];

/**
 * Mobile/touch overrides for upstream {@link SelectComponent}. Applied via prototype patch
 * because the widget is instantiated through JSX rather than DI.
 */
export class QaapSelectComponent extends SelectComponent {

    protected override attachListeners(): void {
        const hide = (event: Event) => {
            if (!this.dropdownRef.current?.contains(event.target as Node)) {
                this.hide();
            }
        };
        const hideOnPointerDown = (event: Event) => {
            const target = event.target;
            if (!(target instanceof Node)) {
                this.hide();
                return;
            }
            if (this.fieldRef.current?.contains(target) || this.dropdownRef.current?.contains(target)) {
                return;
            }
            this.hide();
        };
        const hideOnResize = () => {
            if (!this.state.dimensions) {
                return;
            }
            if (matchesMobileNarrowViewport()) {
                return;
            }
            this.hide();
        };
        this.mountedListeners.set('scroll', hide);
        this.mountedListeners.set('wheel', hide);
        this.mountedListeners.set('resize', hideOnResize);
        this.mountedListeners.set('pointerdown', hideOnPointerDown);

        let parent = this.fieldRef.current?.parentElement;
        while (parent) {
            if (parent.classList.contains('ps')) {
                parent.addEventListener('ps-scroll-y', hide);
            }
            parent = parent.parentElement;
        }

        for (const [key, listener] of this.mountedListeners.entries()) {
            if (key === 'pointerdown') {
                window.addEventListener(key, listener, true);
            } else {
                window.addEventListener(key, listener);
            }
        }

        const fieldEl = this.fieldRef.current;
        const resizablePanel = fieldEl?.closest('.lm-Widget') ?? fieldEl?.parentElement;

        if (resizablePanel && typeof ResizeObserver !== 'undefined') {
            let lastWidth = 0;
            let lastHeight = 0;
            let isFirstFire = true;

            this.resizeObserver = new ResizeObserver(entries => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;

                    if (isFirstFire) {
                        lastWidth = width;
                        lastHeight = height;
                        isFirstFire = false;
                        continue;
                    }

                    if (this.state.dimensions && Math.abs(width - lastWidth) > 2) {
                        this.hide();
                    } else if (
                        this.state.dimensions
                        && Math.abs(height - lastHeight) > 2
                        && !matchesMobileNarrowViewport()
                    ) {
                        this.hide();
                    }

                    lastWidth = width;
                    lastHeight = height;
                }
            });
            this.resizeObserver.observe(resizablePanel);
        }
    }

    override componentWillUnmount(): void {
        this.resizeObserver?.disconnect();
        if (this.mountedListeners.size > 0) {
            const eventListener = this.mountedListeners.get('scroll')!;
            let parent = this.fieldRef.current?.parentElement;
            while (parent) {
                parent.removeEventListener('ps-scroll-y', eventListener);
                parent = parent.parentElement;
            }
            for (const [key, listener] of this.mountedListeners.entries()) {
                if (key === 'pointerdown') {
                    window.removeEventListener(key, listener, true);
                } else {
                    window.removeEventListener(key, listener);
                }
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
                        if (!this.state.dimensions) {
                            this.hide();
                            this.props.onBlur?.();
                        }
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

    protected override renderDropdown(): React.ReactNode {
        if (!this.state.dimensions) {
            return;
        }

        const shellArea = document.getElementById('theia-app-shell')!.getBoundingClientRect();
        const maxWidth = this.alignLeft ? shellArea.width - this.state.dimensions.left : this.state.dimensions.right;
        if (this.mountedListeners.size === 0) {
            this.attachListeners();
            this.optimalWidth = this.getOptimalWidth();
            this.optimalHeight = this.getOptimalHeight(Math.max(this.state.dimensions.width, this.optimalWidth));
        }
        const shellBottom = shellArea.top + shellArea.height;
        const effectiveShellBottom = Math.min(shellBottom, overlayClipBottomProvider?.(shellBottom) ?? shellBottom);
        const availableTop = this.state.dimensions.top - shellArea.top;
        const availableBottom = effectiveShellBottom - this.state.dimensions.bottom;
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

        const viewport = window.visualViewport;
        const viewportHeight = viewport?.height ?? window.innerHeight;
        const viewportWidth = viewport?.width ?? window.innerWidth;
        const rawMaxHeight = invert
            ? this.state.dimensions.top
            : effectiveShellBottom - this.state.dimensions.bottom;
        const maxHeight = Math.max(120, Math.min(rawMaxHeight, viewportHeight * 0.55));
        const dropdownWidth = Math.min(
            Math.max(this.state.dimensions.width, this.optimalWidth),
            this.alignLeft ? maxWidth : this.state.dimensions.right
        );
        return <div key="dropdown" className="theia-select-component-dropdown" style={{
            top: invert ? undefined : this.state.dimensions.bottom,
            bottom: invert ? viewportHeight - this.state.dimensions.top : undefined,
            left: this.alignLeft ? this.state.dimensions.left : undefined,
            right: this.alignLeft ? undefined : viewportWidth - this.state.dimensions.right,
            width: dropdownWidth,
            maxHeight,
            position: 'fixed'
        }} ref={this.dropdownRef}>
            {items}
        </div>;
    }

    protected override renderOption(index: number, option: SelectOption): React.ReactNode {
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
                onPointerDown={event => {
                    event.preventDefault();
                    this.selectOption(index, option);
                }}
            >
                <div key="value" className="theia-select-component-option-value">{option.label ?? option.value}</div>
                {option.detail && <div key="detail" className="theia-select-component-option-detail">{option.detail}</div>}
            </div>
        );
    }
}

export function applyQaapSelectComponentMobilePatches(): void {
    const source = QaapSelectComponent.prototype as unknown as Record<MobilePatchedMethod, unknown>;
    const target = SelectComponent.prototype as unknown as Record<MobilePatchedMethod, unknown>;
    for (const method of MOBILE_PATCHED_METHODS) {
        const patched = source[method];
        if (typeof patched === 'function') {
            target[method] = patched;
        }
    }
}
