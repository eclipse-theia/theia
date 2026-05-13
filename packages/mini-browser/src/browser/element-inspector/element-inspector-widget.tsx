// *****************************************************************************
// Copyright (C) 2026 Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from 'react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { codicon, Message } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { ElementInspectorService } from './element-inspector-service';
import { PickedElement } from './element-inspector-types';

type InspectorTab = 'design' | 'css';

const SUMMARY_FIELDS: ReadonlyArray<{ label: string; keys: string[] }> = [
    { label: 'Layout', keys: ['display', 'position', 'flex-direction', 'justify-content', 'align-items', 'gap'] },
    { label: 'Dimensions', keys: ['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height'] },
    { label: 'Padding', keys: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'] },
    { label: 'Margin', keys: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'] },
    { label: 'Appearance', keys: ['background-color', 'color', 'opacity', 'border-radius', 'box-shadow'] },
    { label: 'Border', keys: ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-color', 'border-style'] },
    { label: 'Text', keys: ['font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align'] }
];

@injectable()
export class ElementInspectorWidget extends ReactWidget {

    static readonly ID = 'theia-mini-browser:element-inspector';
    static readonly LABEL = nls.localize('theia/mini-browser/elementInspector', 'Element Inspector');

    @inject(ElementInspectorService)
    protected readonly service: ElementInspectorService;

    protected currentTab: InspectorTab = 'design';

    @postConstruct()
    protected init(): void {
        this.id = ElementInspectorWidget.ID;
        this.title.label = ElementInspectorWidget.LABEL;
        this.title.caption = ElementInspectorWidget.LABEL;
        this.title.iconClass = codicon('layout-sidebar-right');
        this.title.closable = true;
        this.addClass('theia-mini-browser-inspector');
        this.toDispose.push(this.service.onDidChangeState(() => this.update()));
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected setTab(tab: InspectorTab): void {
        if (this.currentTab !== tab) {
            this.currentTab = tab;
            this.update();
        }
    }

    protected render(): React.ReactNode {
        const picked = this.service.state.picked;
        if (!picked) {
            return this.renderEmpty();
        }
        return (
            <div className='theia-mini-browser-inspector__root'>
                {this.renderComponentsTree(picked)}
                {this.renderTabs()}
                <div className='theia-mini-browser-inspector__body'>
                    {this.currentTab === 'design' ? this.renderDesign(picked) : this.renderCss(picked)}
                </div>
            </div>
        );
    }

    protected renderEmpty(): React.ReactNode {
        return (
            <div className='theia-mini-browser-inspector__empty'>
                <div className={codicon('inspect') + ' theia-mini-browser-inspector__empty-icon'}></div>
                <h3>{ElementInspectorWidget.LABEL}</h3>
                <p>{nls.localize(
                    'theia/mini-browser/elementInspectorHint',
                    'Open a preview in the mini-browser and click the picker icon ({0}) in its toolbar to select an element.',
                    'inspect'
                )}</p>
            </div>
        );
    }

    protected renderComponentsTree(picked: PickedElement): React.ReactNode {
        const chain: Array<{ tagName: string; id?: string; classes: ReadonlyArray<string> }> = [
            ...[...picked.ancestors].reverse(),
            { tagName: picked.tagName, id: picked.id, classes: picked.classes }
        ];
        return (
            <div className='theia-mini-browser-inspector__section'>
                <div className='theia-mini-browser-inspector__section-title'>{nls.localize('theia/mini-browser/elementInspectorComponents', 'Components')}</div>
                <ul className='theia-mini-browser-inspector__tree'>
                    {chain.map((node, index) => {
                        const isLast = index === chain.length - 1;
                        const label = this.formatSelector(node);
                        return (
                            <li
                                key={index + ':' + label}
                                className={'theia-mini-browser-inspector__tree-item' + (isLast ? ' theia-mini-browser-inspector__tree-item--current' : '')}
                                style={{ paddingLeft: `${8 + index * 12}px` }}
                                title={label}
                            >
                                <span className={codicon('chevron-right') + ' theia-mini-browser-inspector__tree-chevron'}></span>
                                <span className='theia-mini-browser-inspector__tree-label'>{label}</span>
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    }

    protected renderTabs(): React.ReactNode {
        const tabs: Array<{ id: InspectorTab; label: string }> = [
            { id: 'design', label: nls.localize('theia/mini-browser/elementInspectorDesign', 'Design') },
            { id: 'css', label: 'CSS' }
        ];
        return (
            <div className='theia-mini-browser-inspector__tabs' role='tablist'>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        role='tab'
                        aria-selected={this.currentTab === tab.id}
                        className={'theia-mini-browser-inspector__tab' + (this.currentTab === tab.id ? ' theia-mini-browser-inspector__tab--active' : '')}
                        onClick={() => this.setTab(tab.id)}
                    >{tab.label}</button>
                ))}
            </div>
        );
    }

    protected renderDesign(picked: PickedElement): React.ReactNode {
        return (
            <div className='theia-mini-browser-inspector__design'>
                {this.renderPositionCard(picked)}
                {SUMMARY_FIELDS.map(group => (
                    <div key={group.label} className='theia-mini-browser-inspector__group'>
                        <div className='theia-mini-browser-inspector__group-title'>{group.label}</div>
                        <div className='theia-mini-browser-inspector__grid'>
                            {group.keys.map(key => {
                                const value = picked.computedStyles[key];
                                if (!value) return undefined;
                                return (
                                    <React.Fragment key={key}>
                                        <span className='theia-mini-browser-inspector__grid-key' title={key}>{this.shortKey(key)}</span>
                                        <span className='theia-mini-browser-inspector__grid-value' title={value}>{value}</span>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    protected renderPositionCard(picked: PickedElement): React.ReactNode {
        const { top, left, width, height } = picked.position;
        return (
            <div className='theia-mini-browser-inspector__group'>
                <div className='theia-mini-browser-inspector__group-title'>{nls.localize('theia/mini-browser/elementInspectorPosition', 'Position')}</div>
                <div className='theia-mini-browser-inspector__pos'>
                    <label><span>X</span><input readOnly value={left} /></label>
                    <label><span>Y</span><input readOnly value={top} /></label>
                    <label><span>W</span><input readOnly value={width} /></label>
                    <label><span>H</span><input readOnly value={height} /></label>
                </div>
            </div>
        );
    }

    protected renderCss(picked: PickedElement): React.ReactNode {
        const entries = Object.entries(picked.computedStyles).filter(([, v]) => !!v);
        return (
            <pre className='theia-mini-browser-inspector__css'>
                <code>
                    {this.formatSelector({ tagName: picked.tagName, id: picked.id, classes: picked.classes })}{' {\n'}
                    {entries.map(([k, v]) => `  ${k}: ${v};\n`).join('')}
                    {'}\n'}
                </code>
            </pre>
        );
    }

    protected formatSelector(node: { tagName: string; id?: string; classes: ReadonlyArray<string> }): string {
        let selector = node.tagName;
        if (node.id) selector += '#' + node.id;
        if (node.classes && node.classes.length) selector += '.' + node.classes.slice(0, 3).join('.');
        return selector;
    }

    protected shortKey(key: string): string {
        const segments = key.split('-');
        if (segments.length <= 2) return key;
        return segments[0] + '-' + segments[segments.length - 1];
    }
}
