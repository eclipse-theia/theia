/********************************************************************************
 * Copyright (C) 2017-2018 TypeFox and others.
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
import { injectable, inject } from 'inversify';
import Octicon, { getIconByName } from '@primer/octicons-react';
import { CommandService } from '../../common';
import { ReactWidget } from '../widgets/react-widget';
import { FrontendApplicationStateService } from '../frontend-application-state';
import { LabelParser, LabelIcon } from '../label-parser';

export interface StatusBarEntry {
    /**
     * For icons we use octicons and fontawesome icons. octicons take precedence over fontawesome. Get more information and the class names
     * here: http://fontawesome.io/icons/
     * To set a text with icon use the following pattern in text string:
     * $(fontawesomeClassName)
     * To use animated icons use the following pattern:
     * $(fontawesomeClassName~typeOfAnimation)
     * Type of animation can be either spin or pulse.
     * Look here for more information to animated icons:
     * http://fontawesome.io/examples/#animated
     */
    text: string;
    alignment: StatusBarAlignment;
    color?: string;
    className?: string;
    tooltip?: string;
    command?: string;
    // tslint:disable-next-line:no-any
    arguments?: any[];
    priority?: number;
    onclick?: (e: MouseEvent) => void;
}

export enum StatusBarAlignment {
    LEFT, RIGHT
}

export interface StatusBarEntryAttributes {
    className?: string;
    title?: string;
    style?: object;
    onClick?: (e: MouseEvent) => void;
}

export const STATUSBAR_WIDGET_FACTORY_ID = 'statusBar';

export const StatusBar = Symbol('StatusBar');

export interface StatusBar {
    setBackgroundColor(color?: string): Promise<void>;
    setColor(color?: string): Promise<void>;
    setElement(id: string, entry: StatusBarEntry): Promise<void>;
    removeElement(id: string): Promise<void>;
}

@injectable()
export class StatusBarImpl extends ReactWidget implements StatusBar {

    protected backgroundColor: string | undefined;
    protected color: string | undefined;
    protected entries: Map<string, StatusBarEntry> = new Map();

    constructor(
        @inject(CommandService) protected readonly commands: CommandService,
        @inject(LabelParser) protected readonly entryService: LabelParser,
        @inject(FrontendApplicationStateService) protected readonly applicationStateService: FrontendApplicationStateService
    ) {
        super();
        delete this.scrollOptions;
        this.id = 'theia-statusBar';
        this.addClass('noselect');
    }

    protected get ready(): Promise<void> {
        return this.applicationStateService.reachedAnyState('initialized_layout', 'ready');
    }

    async setElement(id: string, entry: StatusBarEntry): Promise<void> {
        await this.ready;
        this.entries.set(id, entry);
        this.update();
    }

    async removeElement(id: string): Promise<void> {
        await this.ready;
        this.entries.delete(id);
        this.update();
    }

    async setBackgroundColor(color?: string): Promise<void> {
        await this.ready;
        this.internalSetBackgroundColor(color);
        this.update();
    }

    protected internalSetBackgroundColor(color?: string): void {
        this.backgroundColor = color;
        // tslint:disable-next-line:no-null-keyword
        this.node.style.backgroundColor = this.backgroundColor ? this.backgroundColor : null;
    }

    async setColor(color?: string): Promise<void> {
        await this.ready;
        this.internalSetColor(color);
        this.update();
    }

    protected internalSetColor(color?: string): void {
        this.color = color;
    }

    protected render(): JSX.Element {
        const leftEntries: JSX.Element[] = [];
        const rightEntries: JSX.Element[] = [];
        const elements = Array.from(this.entries).sort((left, right) => {
            const lp = left[1].priority || 0;
            const rp = right[1].priority || 0;
            return rp - lp;
        });
        elements.forEach(([id, entry]) => {
            if (entry.alignment === StatusBarAlignment.LEFT) {
                leftEntries.push(this.renderElement(id, entry));
            } else {
                rightEntries.push(this.renderElement(id, entry));
            }
        });

        return <React.Fragment>
            <div className='area left'>{leftEntries}</div>
            <div className='area right'>{rightEntries}</div>
        </React.Fragment>;
    }

    protected onclick(entry: StatusBarEntry): () => void {
        return () => {
            if (entry.command) {
                const args = entry.arguments || [];
                this.commands.executeCommand(entry.command, ...args);
            }
        };
    }

    protected createAttributes(entry: StatusBarEntry): StatusBarEntryAttributes {
        const attrs: StatusBarEntryAttributes = {};

        if (entry.command) {
            attrs.onClick = this.onclick(entry);
            attrs.className = 'element hasCommand';
        } else if (entry.onclick) {
            attrs.onClick = e => {
                if (entry.onclick) {
                    entry.onclick(e);
                }
            };
            attrs.className = 'element hasCommand';
        } else {
            attrs.className = 'element';
        }

        if (entry.tooltip) {
            attrs.title = entry.tooltip;
        }

        attrs.style = {
            color: entry.color || this.color
        };

        if (entry.className) {
            attrs.className += ' ' + entry.className;
        }

        return attrs;
    }

    protected renderElement(id: string, entry: StatusBarEntry): JSX.Element {
        const childStrings = this.entryService.parse(entry.text);
        const children: JSX.Element[] = [];

        childStrings.forEach((val, key) => {
            if (!(typeof val === 'string') && LabelIcon.is(val)) {
                const octicon = getIconByName(val.name);
                if (octicon) {
                    children.push(<span key={key} className={val.animation ? 'fa-' + val.animation : ''}><Octicon icon={octicon} /></span>);
                } else {
                    children.push(<span key={key} className={`fa fa-${val.name} ${val.animation ? 'fa-' + val.animation : ''}`}></span>);
                }
            } else {
                children.push(<span key={key}>{val}</span>);
            }
        });
        const elementInnerDiv = <React.Fragment>{children}</React.Fragment>;

        return React.createElement('div', { key: id, ...this.createAttributes(entry) }, elementInnerDiv);
    }

}
