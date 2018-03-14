/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { VirtualRenderer, VirtualWidget, Message } from '../widgets';
import { CommandService } from '../../common';
import { h } from '@phosphor/virtualdom';
import { LabelParser, LabelIcon } from '../label-parser';
import { injectable, inject } from 'inversify';
import { Deferred } from '../../common/promise-util';

export interface StatusBarLayoutData {
    entries: StatusBarEntryData[]
    backgroundColor?: string
}

export interface StatusBarEntryData {
    id: string;
    entry: StatusBarEntry
}

export interface StatusBarEntry {
    /**
     * For icons we use fontawesome. Get more information and the class names
     * here: http://fontawesome.io/icons/
     * To set a text with icon use the following pattern in text string:
     * $(fontawesomeClasssName)
     * To use animated icons use the following pattern:
     * $(fontawesomeClassName~typeOfAnimation)
     * Type of animation can be either spin or pulse.
     * Look here for more information to animated icons:
     * http://fontawesome.io/examples/#animated
     */
    text: string;
    alignment: StatusBarAlignment;
    tooltip?: string;
    command?: string;
    // tslint:disable-next-line:no-any
    arguments?: any[];
    priority?: number;
}

export enum StatusBarAlignment {
    LEFT, RIGHT
}

export interface StatusBarEntryAttributes {
    className?: string;
    title?: string;
    onclick?: () => void;
    onmouseover?: () => void;
    onmouseout?: () => void;
}

export const STATUSBAR_WIDGET_FACTORY_ID = 'statusBar';

export const StatusBar = Symbol('StatusBar');

export interface StatusBar {
    setBackgroundColor(color?: string): Promise<void>;
    setElement(id: string, entry: StatusBarEntry): Promise<void>;
    removeElement(id: string): Promise<void>;
}

@injectable()
export class StatusBarImpl extends VirtualWidget implements StatusBar {

    protected backgroundColor: string | undefined;
    protected entries: Map<string, StatusBarEntry> = new Map();
    protected attached = new Deferred<void>();

    constructor(
        @inject(CommandService) protected readonly commands: CommandService,
        @inject(LabelParser) protected readonly entryService: LabelParser
    ) {
        super();
        delete this.scrollOptions;
        this.id = 'theia-statusBar';
    }

    onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.attached.resolve();
    }

    async setElement(id: string, entry: StatusBarEntry): Promise<void> {
        await this.attached.promise;
        this.entries.set(id, entry);
        this.update();
    }

    async removeElement(id: string): Promise<void> {
        await this.attached.promise;
        this.entries.delete(id);
        this.update();
    }

    async setBackgroundColor(color?: string): Promise<void> {
        await this.attached.promise;
        this.internalSetBackgroundColor(color);
    }

    protected internalSetBackgroundColor(color?: string): void {
        this.backgroundColor = color;
        // tslint:disable-next-line:no-null-keyword
        this.node.style.backgroundColor = this.backgroundColor ? this.backgroundColor : null;
    }

    getLayoutData(): StatusBarLayoutData {
        const entries: StatusBarEntryData[] = [];
        this.entries.forEach((entry, id) => {
            entries.push({ id, entry });
        });
        return { entries, backgroundColor: this.backgroundColor };
    }

    setLayoutData(data: StatusBarLayoutData): void {
        if (data.entries) {
            data.entries.forEach(entryData => {
                this.entries.set(entryData.id, entryData.entry);
            });
            this.update();
        }
        this.internalSetBackgroundColor(data.backgroundColor);
    }

    protected render(): h.Child {
        const leftEntries: h.Child[] = [];
        const rightEntries: h.Child[] = [];
        const elements = Array.from(this.entries.values()).sort((left, right) => {
            const lp = left.priority || 0;
            const rp = right.priority || 0;
            return rp - lp;
        });
        elements.forEach(entry => {
            if (entry.alignment === StatusBarAlignment.LEFT) {
                leftEntries.push(this.renderElement(entry));
            } else {
                rightEntries.push(this.renderElement(entry));
            }
        });
        const leftElements = h.div({ className: 'area left' }, VirtualRenderer.flatten(leftEntries));
        const rightElements = h.div({ className: 'area right' }, VirtualRenderer.flatten(rightEntries));
        return VirtualRenderer.flatten([leftElements, rightElements]);
    }

    protected createAttributes(entry: StatusBarEntry): StatusBarEntryAttributes {
        const attrs: StatusBarEntryAttributes = {};

        if (entry.command) {
            attrs.onclick = () => {
                if (entry.command) {
                    const args = entry.arguments || [];
                    this.commands.executeCommand(entry.command, ...args);
                }
            };
            attrs.className = 'element hasCommand';
        } else {
            attrs.className = 'element';
        }

        if (entry.tooltip) {
            attrs.title = entry.tooltip;
        }

        return attrs;
    }

    protected renderElement(entry: StatusBarEntry): h.Child {
        const childStrings = this.entryService.parse(entry.text);
        const children: h.Child[] = [];

        childStrings.forEach((val, idx) => {
            if (!(typeof val === 'string') && LabelIcon.is(val)) {
                const classStr = `fa fa-${val.name} ${val.animation ? 'fa-' + val.animation : ''}`;
                children.push(h.span({ className: classStr }));
            } else {
                children.push(h.span({}, val));
            }
        });
        const elementInnerDiv = h.div(VirtualRenderer.flatten(children));

        return h.div(this.createAttributes(entry), elementInnerDiv);
    }

}
