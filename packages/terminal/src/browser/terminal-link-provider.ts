// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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

import { CancellationToken, ContributionProvider, DisposableCollection, disposableTimeout, isOSX } from '@theia/core';
import { PreferenceService } from '@theia/core/lib/browser';
import { inject, injectable, interfaces, named, postConstruct } from '@theia/core/shared/inversify';
import { IBufferRange, ILink, ILinkDecorations } from 'xterm';
import { TerminalWidget } from './base/terminal-widget';
import { TerminalContribution } from './terminal-contribution';
import { convertLinkRangeToBuffer, getLinkContext, LinkContext } from './terminal-link-helpers';
import { TerminalWidgetImpl } from './terminal-widget-impl';

export const TerminalLinkProvider = Symbol('TerminalLinkProvider');
export interface TerminalLinkProvider {
    provideLinks(line: string, terminal: TerminalWidget, cancellationToken?: CancellationToken): Promise<TerminalLink[]>;
}

export const TerminalLink = Symbol('TerminalLink');
export interface TerminalLink {
    startIndex: number;
    length: number;
    tooltip?: string;
    handle(): Promise<void>;
}

export const XtermLink = Symbol('XtermLink');
export const XtermLinkFactory = Symbol('XtermLinkFactory');
export type XtermLinkFactory = (link: TerminalLink, terminal: TerminalWidgetImpl, context: LinkContext) => ILink;

export function createXtermLinkFactory(ctx: interfaces.Context): XtermLinkFactory {
    return (link: TerminalLink, terminal: TerminalWidgetImpl, context: LinkContext): ILink => {
        const container = ctx.container.createChild();
        container.bind(TerminalLink).toConstantValue(link);
        container.bind(TerminalWidgetImpl).toConstantValue(terminal);
        container.bind(LinkContext).toConstantValue(context);
        container.bind(XtermLinkAdapter).toSelf().inSingletonScope();
        container.bind(XtermLink).toService(XtermLinkAdapter);
        const provider = container.get<ILink>(XtermLink);
        return provider;
    };
}

@injectable()
export class TerminalLinkProviderContribution implements TerminalContribution {

    @inject(ContributionProvider) @named(TerminalLinkProvider)
    protected readonly terminalLinkContributionProvider: ContributionProvider<TerminalLinkProvider>;

    @inject(XtermLinkFactory)
    protected readonly xtermLinkFactory: XtermLinkFactory;

    onCreate(terminalWidget: TerminalWidgetImpl): void {
        terminalWidget.getTerminal().registerLinkProvider({
            provideLinks: (line, provideLinks) => this.provideTerminalLinks(terminalWidget, line, provideLinks)
        });
    }

    protected async provideTerminalLinks(terminal: TerminalWidgetImpl, line: number, provideLinks: (links?: ILink[]) => void): Promise<void> {
        const context = getLinkContext(terminal.getTerminal(), line);

        const linkProviderPromises: Promise<TerminalLink[]>[] = [];
        for (const provider of this.terminalLinkContributionProvider.getContributions()) {
            linkProviderPromises.push(provider.provideLinks(context.text, terminal));
        }

        const xtermLinks: ILink[] = [];
        for (const providerResult of await Promise.allSettled(linkProviderPromises)) {
            if (providerResult.status === 'fulfilled') {
                const providedLinks = providerResult.value;
                xtermLinks.push(...providedLinks.map(link => this.xtermLinkFactory(link, terminal, context)));
            } else {
                console.warn('Terminal link provider failed to provide links', providerResult.reason);
            }
        }

        provideLinks(xtermLinks);
    }

}

const DELAY_PREFERENCE = 'workbench.hover.delay';

@injectable()
export class XtermLinkAdapter implements ILink {

    text: string;
    range: IBufferRange;
    decorations: ILinkDecorations;

    @inject(TerminalLink) protected link: TerminalLink;
    @inject(TerminalWidgetImpl) protected terminalWidget: TerminalWidgetImpl;
    @inject(LinkContext) protected context: LinkContext;
    @inject(PreferenceService) protected readonly preferences: PreferenceService;

    protected toDispose = new DisposableCollection();

    protected mouseEnteredHover = false;
    protected mouseLeftHover = false;

    @postConstruct()
    initializeLinkFields(): void {
        const range = {
            startColumn: this.link.startIndex + 1,
            startLineNumber: 1,
            endColumn: this.link.startIndex + this.link.length + 1,
            endLineNumber: 1
        };
        const terminal = this.terminalWidget.getTerminal();
        this.range = convertLinkRangeToBuffer(this.context.lines, terminal.cols, range, this.context.startLine);
        this.text = this.context.text.substring(this.link.startIndex, this.link.startIndex + this.link.length) || '';
    }

    hover(event: MouseEvent, text: string): void {
        this.scheduleHover(event);
    }

    protected scheduleHover(event: MouseEvent): void {
        this.cancelHover();
        const delay: number = this.preferences.get(DELAY_PREFERENCE) ?? 500;
        this.toDispose.push(disposableTimeout(() => this.showHover(event), delay));
    }

    protected showHover(event: MouseEvent): void {
        this.toDispose.push(this.terminalWidget.onMouseEnterLinkHover(() => this.mouseEnteredHover = true));
        this.toDispose.push(this.terminalWidget.onMouseLeaveLinkHover(mouseEvent => {
            this.mouseLeftHover = true;
            this.leave(mouseEvent);
        }));
        this.terminalWidget.showLinkHover(
            () => this.executeLinkHandler(),
            event.clientX,
            event.clientY,
            this.link.tooltip
        );
    }

    leave(event: MouseEvent): void {
        this.toDispose.push(disposableTimeout(() => {
            if (!this.mouseEnteredHover || this.mouseLeftHover) {
                this.cancelHover();
            }
        }, 50));
    }

    protected cancelHover(): void {
        this.mouseEnteredHover = false;
        this.mouseLeftHover = false;
        this.toDispose.dispose();
        this.terminalWidget.hideLinkHover();
    }

    activate(event: MouseEvent, text: string): void {
        event.preventDefault();
        if (this.isModifierKeyDown(event) || this.wasTouchEvent(event, this.terminalWidget.lastTouchEndEvent)) {
            this.executeLinkHandler();
        } else {
            this.terminalWidget.getTerminal().focus();
        }
    }

    protected executeLinkHandler(): void {
        this.link.handle();
        this.cancelHover();
    }

    protected isModifierKeyDown(event: MouseEvent | KeyboardEvent): boolean {
        return isOSX ? event.metaKey : event.ctrlKey;
    }

    protected wasTouchEvent(event: MouseEvent, lastTouchEnd?: TouchEvent): boolean {
        if (!lastTouchEnd) {
            return false;
        }
        if ((event.timeStamp - lastTouchEnd.timeStamp) > 400) {
            // A 'touchend' event typically precedes a matching 'click' event by 50ms.
            return false;
        }
        if (Math.abs(event.pageX - (lastTouchEnd as unknown as MouseEvent).pageX) > 5) {
            // Matching 'touchend' and 'click' events typically have the same page coordinates,
            // plus or minus 1 pixel.
            return false;
        }
        if (Math.abs(event.pageY - (lastTouchEnd as unknown as MouseEvent).pageY) > 5) {
            return false;
        }
        // We have a match! This link was tapped.
        return true;
    }

}
