/********************************************************************************
 * Copyright (C) 2023 Hundsun and others.
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
import * as ReactDOM from 'react-dom';
import '../../../src/browser/style/dropdown-component.css';

export interface DropdownOption {
    label: string | React.ReactElement;
    value: string;
    group?: string;
    onClick?: (e?: React.MouseEvent<HTMLElement>) => void
}

export interface DropdownComponentProps {
    options: DropdownOption[];
    children: React.ReactElement;
    onBlur?: () => void,
    onFocus?: () => void
}

export const DROPDOWN_COMPONENT_CONTAINER = 'dropdown-component-container';

export const DropdownComponent: React.FC<DropdownComponentProps> = props => {
    const { children: dropdownTrigger, options } = props;
    let dropdownElement: HTMLElement;
    const fieldRef = React.useRef<HTMLDivElement>();
    const dropdownRef = React.useRef<HTMLDivElement>();

    const [dimensions, setDimensions] = React.useState<DOMRect>();
    const [dropdownItems, setDropdownItems] = React.useState<{ [key: string]: DropdownOption[] }>({});

    (() => {
        let list = document.getElementById(DROPDOWN_COMPONENT_CONTAINER);
        if (!list) {
            list = document.createElement('div');
            list.id = DROPDOWN_COMPONENT_CONTAINER;
            document.body.appendChild(list);
        }
        dropdownElement = list;
    })();

    React.useEffect(() => {
        const items: { [key: string]: DropdownOption[] } = {};
        options.forEach(option => {
            const { group = 'default' } = option;
            if (items[group]) {
                items[group].push(option);
            } else {
                items[group] = [option];
            }
        });

        setDropdownItems(items);
    }, [options]);

    const handleClickEvent = (event: React.MouseEvent<HTMLElement>): void => {
        toggleVisibility();
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
    };

    const toggleVisibility = () => {
        if (!fieldRef.current) {
            return;
        }
        if (!dimensions) {
            const rect = fieldRef.current.getBoundingClientRect();
            setDimensions(rect);
            fieldRef.current.focus();
        } else {
            hide();
        }
    };

    const hide = () => {
        if (dropdownRef.current) {
            setDimensions(undefined);
        }
    };

    const renderOptions = (): React.ReactNode => (
        Object.entries(dropdownItems).map(([key, items]) => (
            <React.Fragment key={key}>
                {items.map(item => (
                    <div
                        key={item.value}
                        className="theia-dropdown-component-dropdown-item"
                        onMouseDown={e => {
                            item.onClick?.(e);
                            hide();
                            e.stopPropagation();
                        }}
                    >
                        {item.label}
                    </div>
                ))}
                <div className="theia-dropdown-component-dropdown-line" key={key + '_line'}></div>
            </React.Fragment >
        ))
    );

    const renderDropdown = (): React.ReactNode => {
        if (!dimensions) {
            return;
        }

        return <div
            ref={dropdownRef as React.MutableRefObject<HTMLDivElement>}
            key="dropdown"
            className="theia-dropdown-component-dropdown"
            style={{
                position: 'absolute',
                top: dimensions.bottom + 1,
                left: dimensions.left - 100,
            }}
        >
            {renderOptions()}
        </div>;
    };

    return <>
        <div
            tabIndex={0}
            key="dropdown-component"
            ref={fieldRef as React.MutableRefObject<HTMLDivElement>}
            className="theia-dropdown-component"
            onClick={e => handleClickEvent(e)}
            onBlur={() => {
                hide();
                props.onBlur?.();
            }}
            onFocus={() => props.onFocus?.()}

        >
            {dropdownTrigger}
        </div>
        {ReactDOM.createPortal(renderDropdown(), dropdownElement)}
    </>;
};
