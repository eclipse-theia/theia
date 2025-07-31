// *****************************************************************************
// Copyright (C) 2017-2018 TypeFox and others.
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
import { injectable, inject } from 'inversify';
import debounce = require('lodash.debounce');
import { CommandService } from '../../common';
import { ReactWidget } from '../widgets/react-widget';
import { FrontendApplicationStateService } from '../frontend-application-state';
import { LabelParser, LabelIcon } from '../label-parser';
import { PreferenceService } from '../preferences';
import { StatusBar, StatusBarEntry, StatusBarAlignment, StatusBarViewEntry } from './status-bar-types';
import { StatusBarViewModel } from './status-bar-view-model';
import { HoverService } from '../hover-service';
import { codicon } from '../widgets';
export { StatusBar, StatusBarAlignment, StatusBarEntry };

@injectable()
export class StatusBarImpl extends ReactWidget implements StatusBar {

    protected backgroundColor: string | undefined;
    protected color: string | undefined;

    constructor(
        @inject(CommandService) protected readonly commands: CommandService,
        @inject(LabelParser) protected readonly entryService: LabelParser,
        @inject(FrontendApplicationStateService) protected readonly applicationStateService: FrontendApplicationStateService,
        @inject(PreferenceService) protected readonly preferences: PreferenceService,
        @inject(StatusBarViewModel) protected readonly viewModel: StatusBarViewModel,
        @inject(HoverService) protected readonly hoverService: HoverService,
    ) {
        super();
        delete this.scrollOptions;
        this.id = 'theia-statusBar';
        this.addClass('noselect');
        // Hide the status bar until the `workbench.statusBar.visible` preference returns with a `true` value.
        this.hide();
        this.preferences.ready.then(() => {
            const preferenceValue = this.preferences.get<boolean>('workbench.statusBar.visible', true);
            this.setHidden(!preferenceValue);
        });
        this.toDispose.push(
            this.preferences.onPreferenceChanged(preference => {
                if (preference.preferenceName === 'workbench.statusBar.visible') {
                    this.setHidden(!preference.newValue);
                }
            })
        );
        this.toDispose.push(this.viewModel.onDidChange(() => this.debouncedUpdate()));
    }

    protected debouncedUpdate = debounce(() => this.update(), 50);

    protected get ready(): Promise<void> {
        return this.applicationStateService.reachedAnyState('initialized_layout', 'ready');
    }

    async setElement(id: string, entry: StatusBarEntry): Promise<void> {
        await this.ready;
        this.viewModel.set(id, entry);
    }

    async removeElement(id: string): Promise<void> {
        await this.ready;
        this.viewModel.remove(id);
    }

    async setBackgroundColor(color?: string): Promise<void> {
        await this.ready;
        this.internalSetBackgroundColor(color);
        this.update();
    }

    protected internalSetBackgroundColor(color?: string): void {
        this.backgroundColor = color;
        this.node.style.backgroundColor = this.backgroundColor || '';
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
        const leftEntries = Array.from(this.viewModel.getLeft(), entry => this.renderElement(entry));
        const rightEntries = Array.from(this.viewModel.getRight(), entry => this.renderElement(entry));

        return <React.Fragment>
            <div className='area left'>{leftEntries}</div>
            <div className='area right'>{rightEntries}</div>
        </React.Fragment>;
    }

    protected triggerCommand(entry: StatusBarEntry): () => void {
        return () => {
            if (entry.command) {
                const args = entry.arguments || [];
                this.commands.executeCommand(entry.command, ...args);
            }
        };
    }

    protected requestHover(e: React.MouseEvent<HTMLElement, MouseEvent>, entry: StatusBarEntry): void {
        this.hoverService.requestHover({
            content: entry.tooltip!,
            target: e.currentTarget,
            position: 'top',
            interactive: entry.tooltip instanceof HTMLElement,
        });
    }

    protected createAttributes(viewEntry: StatusBarViewEntry): React.Attributes & React.HTMLAttributes<HTMLElement> {
        const attrs: React.Attributes & React.HTMLAttributes<HTMLElement> = {};
        const entry = viewEntry.entry;
        attrs.id = 'status-bar-' + viewEntry.id;
        attrs.className = 'element';
        if (entry.command || entry.onclick || entry.tooltip) {
            attrs.className += ' hasCommand';
        }
        if (entry.command) {
            attrs.onClick = this.triggerCommand(entry);
        } else if (entry.onclick) {
            attrs.onClick = e => entry.onclick?.(e.nativeEvent);
        } else {
            attrs.onClick = e => this.requestHover(e, entry);
        }

        if (viewEntry.compact && viewEntry.alignment !== undefined) {
            attrs.className += viewEntry.alignment === StatusBarAlignment.RIGHT ? ' compact-right' : ' compact-left';
        }

        if (entry.tooltip) {
            attrs.onMouseEnter = e => this.requestHover(e, entry);
        }
        if (entry.className) {
            attrs.className += ' ' + entry.className;
        }
        if (entry.accessibilityInformation) {
            attrs['aria-label'] = entry.accessibilityInformation.label;
            attrs.role = entry.accessibilityInformation.role;
        } else {
            attrs['aria-label'] = [entry.text, entry.tooltip].join(', ');
        }
        if (entry.backgroundColor) {
            attrs.className += ' has-background';
        }

        attrs.style = {
            color: entry.color || this.color,
            backgroundColor: entry.backgroundColor
        };

        return attrs;
    }

    protected renderElement(entry: StatusBarViewEntry): JSX.Element {
        const childStrings = this.entryService.parse(entry.entry.text);
        const children: JSX.Element[] = [];

        childStrings.forEach((val, key) => {
            if (LabelIcon.is(val)) {
                const animation = val.animation ? ` fa-${val.animation}` : '';
                if (val.name.startsWith('codicon-')) {
                    children.push(<span key={key} className={`codicon ${val.name}${animation}`}></span>);
                } else if (val.name.startsWith('fa-')) {
                    children.push(<span key={key} className={`fa ${val.name}${animation}`}></span>);
                } else {
                    children.push(<span key={key} className={`${codicon(val.name)}${animation}`}></span>);
                }
            } else {
                children.push(<span key={key}>{val}</span>);
            }
        });
        return <div key={entry.id} {...this.createAttributes(entry)}>
            {children}
        </div>;
    }

}
