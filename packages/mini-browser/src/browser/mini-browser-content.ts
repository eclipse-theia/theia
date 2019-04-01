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

import * as PDFObject from 'pdfobject';
import { inject, injectable, postConstruct } from 'inversify';
import { Message } from '@phosphor/messaging';
import { PanelLayout, SplitPanel } from '@phosphor/widgets';
import URI from '@theia/core/lib/common/uri';
import { ILogger } from '@theia/core/lib/common/logger';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { FileSystem } from '@theia/filesystem/lib/common/filesystem';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { FrontendApplicationContribution, ApplicationShell, parseCssTime, Key, KeyCode } from '@theia/core/lib/browser';
import { FileSystemWatcher, FileChangeEvent } from '@theia/filesystem/lib/browser/filesystem-watcher';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import { BaseWidget, addEventListener, FocusTracker, Widget } from '@theia/core/lib/browser/widgets/widget';
import { LocationMapperService } from './location-mapper-service';

import debounce = require('lodash.debounce');

/**
 * Initializer properties for the embedded browser widget.
 */
@injectable()
export class MiniBrowserProps {

    /**
     * `show` if the toolbar should be visible. If `read-only`, the toolbar is visible but the address cannot be changed and it acts as a link instead.\
     * `hide` if the toolbar should be hidden. `show` by default. If the `startPage` is not defined, this property is always `show`.
     */
    readonly toolbar?: 'show' | 'hide' | 'read-only';

    /**
     * If defined, the browser will load this page on startup. Otherwise, it show a blank page.
     */
    readonly startPage?: string;

    /**
     * Sandbox options for the underlying `iframe`. Defaults to `SandboxOptions#DEFAULT` if not provided.
     */
    readonly sandbox?: MiniBrowserProps.SandboxOptions[];

    /**
     * The optional icon class for the widget.
     */
    readonly iconClass?: string;

    /**
     * The desired name of the widget.
     */
    readonly name?: string;

    /**
     * `true` if the `iFrame`'s background has to be reset to the default white color. Otherwise, `false`. `false` is the default.
     */
    readonly resetBackground?: boolean;

}

export namespace MiniBrowserProps {

    /**
     * Enumeration of the supported `sandbox` options for the `iframe`.
     */
    export enum SandboxOptions {

        /**
         * Allows form submissions.
         */
        'allow-forms',

        /**
         * Allows popups, such as `window.open()`, `showModalDialog()`, `target=”_blank”`, etc.
         */
        'allow-popups',

        /**
         * Allows pointer lock.
         */
        'allow-pointer-lock',

        /**
         * Allows the document to maintain its origin. Pages loaded from https://example.com/ will retain access to that origin’s data.
         */
        'allow-same-origin',

        /**
         * Allows JavaScript execution. Also allows features to trigger automatically (as they’d be trivial to implement via JavaScript).
         */
        'allow-scripts',

        /**
         * Allows the document to break out of the frame by navigating the top-level `window`.
         */
        'allow-top-navigation',

        /**
         * Allows the embedded browsing context to open modal windows.
         */
        'allow-modals',

        /**
         * Allows the embedded browsing context to disable the ability to lock the screen orientation.
         */
        'allow-orientation-lock',

        /**
         * Allows a sandboxed document to open new windows without forcing the sandboxing flags upon them.
         * This will allow, for example, a third-party advertisement to be safely sandboxed without forcing the same restrictions upon a landing page.
         */
        'allow-popups-to-escape-sandbox',

        /**
         * Allows embedders to have control over whether an iframe can start a presentation session.
         */
        'allow-presentation',

        /**
         * Allows the embedded browsing context to navigate (load) content to the top-level browsing context only when initiated by a user gesture.
         * If this keyword is not used, this operation is not allowed.
         */
        'allow-top-navigation-by-user-activation'
    }

    export namespace SandboxOptions {

        /**
         * The default `sandbox` options, if other is not provided.
         *
         * See: https://www.html5rocks.com/en/tutorials/security/sandboxed-iframes/
         */
        export const DEFAULT: SandboxOptions[] = [
            SandboxOptions['allow-same-origin'],
            SandboxOptions['allow-scripts'],
            SandboxOptions['allow-popups'],
            SandboxOptions['allow-forms'],
            SandboxOptions['allow-modals']
        ];

    }

}

/**
 * Contribution that tracks `mouseup` and `mousedown` events.
 *
 * This is required to be able to track the `TabBar`, `DockPanel`, and `SidePanel` resizing and drag and drop events correctly
 * all over the application. By default, when the mouse is over an `iframe` we lose the mouse tracking ability, so whenever
 * we click (`mousedown`), we overlay a transparent `div` over the `iframe` in the Mini Browser, then we set the `display` of
 * the transparent `div` to `none` on `mouseup` events.
 */
@injectable()
export class MiniBrowserMouseClickTracker implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly applicationShell: ApplicationShell;

    protected readonly toDispose = new DisposableCollection();
    protected readonly toDisposeOnActiveChange = new DisposableCollection();

    protected readonly mouseupEmitter = new Emitter<MouseEvent>();
    protected readonly mousedownEmitter = new Emitter<MouseEvent>();
    protected readonly mouseupListener: (e: MouseEvent) => void = e => this.mouseupEmitter.fire(e);
    protected readonly mousedownListener: (e: MouseEvent) => void = e => this.mousedownEmitter.fire(e);

    onStart(): void {
        // Here we need to attach a `mousedown` listener to the `TabBar`s, `DockPanel`s and the `SidePanel`s. Otherwise, Phosphor handles the event and stops the propagation.
        // Track the `mousedown` on the `TabBar` for the currently active widget.
        this.applicationShell.activeChanged.connect((shell: ApplicationShell, args: FocusTracker.IChangedArgs<Widget>) => {
            this.toDisposeOnActiveChange.dispose();
            if (args.newValue) {
                const tabBar = shell.getTabBarFor(args.newValue);
                if (tabBar) {
                    this.toDisposeOnActiveChange.push(addEventListener(tabBar.node, 'mousedown', this.mousedownListener, true));
                }
            }
        });

        // Track the `mousedown` events for the `SplitPanel`s, if any.
        const { layout } = this.applicationShell;
        if (layout instanceof PanelLayout) {
            this.toDispose.pushAll(
                layout.widgets.filter(MiniBrowserMouseClickTracker.isSplitPanel).map(splitPanel => addEventListener(splitPanel.node, 'mousedown', this.mousedownListener, true))
            );
        }
        // Track the `mousedown` on each `DockPanel`.
        const { mainPanel, bottomPanel, leftPanelHandler, rightPanelHandler } = this.applicationShell;
        this.toDispose.pushAll([mainPanel, bottomPanel, leftPanelHandler.dockPanel, rightPanelHandler.dockPanel]
            .map(panel => addEventListener(panel.node, 'mousedown', this.mousedownListener, true)));

        // The `mouseup` event has to be tracked on the `document`. Phosphor attaches to there.
        document.addEventListener('mouseup', this.mouseupListener, true);

        // Make sure it is disposed in the end.
        this.toDispose.pushAll([
            this.mousedownEmitter,
            this.mouseupEmitter,
            Disposable.create(() => document.removeEventListener('mouseup', this.mouseupListener, true))
        ]);
    }

    onStop(): void {
        this.toDispose.dispose();
        this.toDisposeOnActiveChange.dispose();
    }

    get onMouseup(): Event<MouseEvent> {
        return this.mouseupEmitter.event;
    }

    get onMousedown(): Event<MouseEvent> {
        return this.mousedownEmitter.event;
    }

}

export namespace MiniBrowserMouseClickTracker {

    export function isSplitPanel(arg: Widget): arg is SplitPanel {
        return arg instanceof SplitPanel;
    }

}

export const MiniBrowserContentFactory = Symbol('MiniBrowserContentFactory');
export type MiniBrowserContentFactory = (props: MiniBrowserProps) => MiniBrowserContent;

@injectable()
export class MiniBrowserContent extends BaseWidget {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(LocationMapperService)
    protected readonly locationMapper: LocationMapperService;

    @inject(KeybindingRegistry)
    protected readonly keybindings: KeybindingRegistry;

    @inject(MiniBrowserMouseClickTracker)
    protected readonly mouseTracker: MiniBrowserMouseClickTracker;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(FileSystemWatcher)
    protected readonly fileSystemWatcher: FileSystemWatcher;

    protected readonly submitInputEmitter = new Emitter<string>();
    protected readonly navigateBackEmitter = new Emitter<void>();
    protected readonly navigateForwardEmitter = new Emitter<void>();
    protected readonly refreshEmitter = new Emitter<void>();
    protected readonly openEmitter = new Emitter<void>();

    protected readonly input: HTMLInputElement;
    protected readonly loadIndicator: HTMLElement;
    protected readonly errorBar: HTMLElement & Readonly<{ message: HTMLElement }>;
    protected readonly frame: HTMLIFrameElement;
    // tslint:disable-next-line:max-line-length
    // XXX This is a hack to be able to tack the mouse events when drag and dropping the widgets. On `mousedown` we put a transparent div over the `iframe` to avoid losing the mouse tacking.
    protected readonly transparentOverlay: HTMLElement;
    // XXX It is a hack. Instead of loading the PDF in an iframe we use `PDFObject` to render it in a div.
    protected readonly pdfContainer: HTMLElement;

    protected frameLoadTimeout: number;
    protected readonly initialHistoryLength: number;
    protected readonly toDisposeOnGo = new DisposableCollection();

    constructor(@inject(MiniBrowserProps) protected readonly props: MiniBrowserProps) {
        super();
        this.node.tabIndex = 0;
        this.addClass(MiniBrowserContent.Styles.MINI_BROWSER);
        this.input = this.createToolbar(this.node).input;
        const contentArea = this.createContentArea(this.node);
        this.frame = contentArea.frame;
        this.transparentOverlay = contentArea.transparentOverlay;
        this.loadIndicator = contentArea.loadIndicator;
        this.errorBar = contentArea.errorBar;
        this.pdfContainer = contentArea.pdfContainer;
        this.initialHistoryLength = history.length;
        this.toDispose.pushAll([
            this.submitInputEmitter,
            this.navigateBackEmitter,
            this.navigateForwardEmitter,
            this.refreshEmitter,
            this.openEmitter
        ]);
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.mouseTracker.onMousedown(e => {
            if (this.frame.style.display !== 'none') {
                this.transparentOverlay.style.display = 'block';
            }
        }));
        this.toDispose.push(this.mouseTracker.onMouseup(e => {
            if (this.frame.style.display !== 'none') {
                this.transparentOverlay.style.display = 'none';
            }
        }));
        const { startPage } = this.props;
        if (startPage) {
            setTimeout(() => this.go(startPage), 500);
            this.listenOnContentChange(startPage);
        }
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        if (this.getToolbarProps() !== 'hide') {
            this.input.focus();
        } else {
            this.node.focus();
        }
    }

    protected async listenOnContentChange(location: string): Promise<void> {
        if (location.startsWith('file://')) {
            if (await this.fileSystem.exists(location)) {
                const fileUri = new URI(location);
                const watcher = await this.fileSystemWatcher.watchFileChanges(fileUri);
                this.toDispose.push(watcher);
                const onFileChange = (event: FileChangeEvent) => {
                    if (FileChangeEvent.isChanged(event, fileUri)) {
                        this.go(location, {
                            showLoadIndicator: false
                        });
                    }
                };
                this.toDispose.push(this.fileSystemWatcher.onFilesChanged(debounce(onFileChange, 500)));
            }
        }
    }

    protected createToolbar(parent: HTMLElement): HTMLDivElement & Readonly<{ input: HTMLInputElement }> {
        const toolbar = document.createElement('div');
        toolbar.classList.add(this.getToolbarProps() === 'read-only' ? MiniBrowserContent.Styles.TOOLBAR_READ_ONLY : MiniBrowserContent.Styles.TOOLBAR);
        parent.appendChild(toolbar);
        this.createPrevious(toolbar);
        this.createNext(toolbar);
        this.createRefresh(toolbar);
        const input = this.createInput(toolbar);
        input.readOnly = this.getToolbarProps() === 'read-only';
        this.createOpen(toolbar);
        if (this.getToolbarProps() === 'hide') {
            toolbar.style.display = 'none';
        }
        return Object.assign(toolbar, { input });
    }

    protected getToolbarProps(): 'show' | 'hide' | 'read-only' {
        return !this.props.startPage ? 'show' : this.props.toolbar || 'show';
    }

    // tslint:disable-next-line:max-line-length
    protected createContentArea(parent: HTMLElement): HTMLElement & Readonly<{ frame: HTMLIFrameElement, loadIndicator: HTMLElement, errorBar: HTMLElement & Readonly<{ message: HTMLElement }>, pdfContainer: HTMLElement, transparentOverlay: HTMLElement }> {
        const contentArea = document.createElement('div');
        contentArea.classList.add(MiniBrowserContent.Styles.CONTENT_AREA);

        const loadIndicator = document.createElement('div');
        loadIndicator.classList.add(MiniBrowserContent.Styles.PRE_LOAD);
        loadIndicator.style.display = 'none';

        const errorBar = this.createErrorBar();

        const frame = this.createIFrame();
        this.submitInputEmitter.event(input => this.go(input, {
            preserveFocus: false
        }));
        this.navigateBackEmitter.event(this.handleBack.bind(this));
        this.navigateForwardEmitter.event(this.handleForward.bind(this));
        this.refreshEmitter.event(this.handleRefresh.bind(this));
        this.openEmitter.event(this.handleOpen.bind(this));

        const transparentOverlay = document.createElement('div');
        transparentOverlay.classList.add(MiniBrowserContent.Styles.TRANSPARENT_OVERLAY);
        transparentOverlay.style.display = 'none';

        const pdfContainer = document.createElement('div');
        pdfContainer.classList.add(MiniBrowserContent.Styles.PDF_CONTAINER);
        pdfContainer.id = `${this.id}-pdf-container`;
        pdfContainer.style.display = 'none';

        contentArea.appendChild(errorBar);
        contentArea.appendChild(transparentOverlay);
        contentArea.appendChild(pdfContainer);
        contentArea.appendChild(loadIndicator);
        contentArea.appendChild(frame);

        parent.appendChild(contentArea);
        return Object.assign(contentArea, { frame, loadIndicator, errorBar, pdfContainer, transparentOverlay });
    }

    protected createIFrame(): HTMLIFrameElement {
        const frame = document.createElement('iframe');
        const sandbox = (this.props.sandbox || MiniBrowserProps.SandboxOptions.DEFAULT).map(name => MiniBrowserProps.SandboxOptions[name]);
        frame.sandbox.add(...sandbox);
        this.toDispose.push(addEventListener(frame, 'load', this.onFrameLoad.bind(this)));
        this.toDispose.push(addEventListener(frame, 'error', this.onFrameError.bind(this)));
        return frame;
    }

    protected createErrorBar(): HTMLElement & Readonly<{ message: HTMLElement }> {
        const errorBar = document.createElement('div');
        errorBar.classList.add(MiniBrowserContent.Styles.ERROR_BAR);
        errorBar.style.display = 'none';

        const icon = document.createElement('span');
        icon.classList.add('fa', 'problem-tab-icon');
        errorBar.appendChild(icon);

        const message = document.createElement('span');
        errorBar.appendChild(message);

        return Object.assign(errorBar, { message });
    }

    protected onFrameLoad(): void {
        clearTimeout(this.frameLoadTimeout);
        this.maybeResetBackground();
        this.hideLoadIndicator();
        this.hideErrorBar();
    }

    protected onFrameError(): void {
        clearTimeout(this.frameLoadTimeout);
        this.maybeResetBackground();
        this.hideLoadIndicator();
        this.showErrorBar('An error occurred while loading this page');
    }

    protected onFrameTimeout(): void {
        clearTimeout(this.frameLoadTimeout);
        this.maybeResetBackground();
        this.hideLoadIndicator();
        this.showErrorBar('Loading this page is taking longer than usual');
    }

    protected showLoadIndicator(): void {
        this.loadIndicator.classList.remove(MiniBrowserContent.Styles.FADE_OUT);
        this.loadIndicator.style.display = 'block';
    }

    protected hideLoadIndicator(): void {
        // Start the fade-out transition.
        this.loadIndicator.classList.add(MiniBrowserContent.Styles.FADE_OUT);
        // Actually hide the load indicator after the transition is finished.
        const preloadStyle = window.getComputedStyle(this.loadIndicator);
        const transitionDuration = parseCssTime(preloadStyle.transitionDuration, 0);
        setTimeout(() => {
            // But don't hide it if it was shown again since the transition started.
            if (this.loadIndicator.classList.contains(MiniBrowserContent.Styles.FADE_OUT)) {
                this.loadIndicator.style.display = 'none';
                this.loadIndicator.classList.remove(MiniBrowserContent.Styles.FADE_OUT);
            }
        }, transitionDuration);
    }

    protected showErrorBar(message: string): void {
        this.errorBar.message.textContent = message;
        this.errorBar.style.display = 'block';
    }

    protected hideErrorBar(): void {
        this.errorBar.message.textContent = '';
        this.errorBar.style.display = 'none';
    }

    protected maybeResetBackground(): void {
        if (this.props.resetBackground === true) {
            this.frame.style.backgroundColor = 'white';
        }
    }

    protected handleBack(): void {
        if (history.length - this.initialHistoryLength > 0) {
            history.back();
        }
    }

    protected handleForward(): void {
        if (history.length > this.initialHistoryLength) {
            history.forward();
        }
    }

    protected handleRefresh(): void {
        // Initial pessimism; use the location of the input.
        let location: string | undefined = this.props.startPage;
        // Use the the location from the `input`.
        if (this.input && this.input.value) {
            location = this.input.value;
        }
        try {
            const { contentDocument } = this.frame;
            if (contentDocument && contentDocument.location) {
                location = contentDocument.location.href;
            }
        } catch {
            // Security exception due to CORS when trying to access the `location.href` of the content document.
        }
        if (location) {
            this.go(location, {
                preserveFocus: false
            });
        }
    }

    protected handleOpen(): void {
        const location = this.frameSrc() || this.input.value;
        if (location) {
            this.windowService.openNewWindow(location);
        }
    }

    protected createInput(parent: HTMLElement): HTMLInputElement {
        const input = document.createElement('input');
        input.type = 'text';
        this.toDispose.pushAll([
            addEventListener(input, 'keydown', this.handleInputChange.bind(this)),
            addEventListener(input, 'click', () => {
                if (this.getToolbarProps() === 'read-only') {
                    this.handleOpen();
                } else {
                    if (input.value) {
                        input.select();
                    }
                }
            })
        ]);
        parent.appendChild(input);
        return input;
    }

    protected handleInputChange(e: KeyboardEvent): void {
        const { key } = KeyCode.createKeyCode(e);
        if (key && Key.ENTER.keyCode === key.keyCode && this.getToolbarProps() === 'show') {
            const { srcElement } = e;
            if (srcElement instanceof HTMLInputElement) {
                this.mapLocation(srcElement.value).then(location => this.submitInputEmitter.fire(location));
            }
        }
    }

    protected createPrevious(parent: HTMLElement): HTMLElement {
        return this.onClick(this.createButton(parent, 'Show The Previous Page', MiniBrowserContent.Styles.PREVIOUS), this.navigateBackEmitter);
    }

    protected createNext(parent: HTMLElement): HTMLElement {
        return this.onClick(this.createButton(parent, 'Show The Next Page', MiniBrowserContent.Styles.NEXT), this.navigateForwardEmitter);
    }

    protected createRefresh(parent: HTMLElement): HTMLElement {
        return this.onClick(this.createButton(parent, 'Reload This Page', MiniBrowserContent.Styles.REFRESH), this.refreshEmitter);
    }

    protected createOpen(parent: HTMLElement): HTMLElement {
        const button = this.onClick(this.createButton(parent, 'Open In A New Window', MiniBrowserContent.Styles.OPEN), this.openEmitter);
        return button;
    }

    protected createButton(parent: HTMLElement, title: string, ...className: string[]): HTMLElement {
        const button = document.createElement('div');
        button.title = title;
        button.classList.add(...className, MiniBrowserContent.Styles.BUTTON);
        parent.appendChild(button);
        return button;
    }

    // tslint:disable-next-line:no-any
    protected onClick(element: HTMLElement, emitter: Emitter<any>): HTMLElement {
        this.toDispose.push(addEventListener(element, 'click', () => {
            if (!element.classList.contains(MiniBrowserContent.Styles.DISABLED)) {
                emitter.fire(undefined);
            }
        }));
        return element;
    }

    protected mapLocation(location: string): Promise<string> {
        return this.locationMapper.map(location);
    }

    protected setInput(value: string): void {
        if (this.input.value !== value) {
            this.input.value = value;
        }
    }

    protected frameSrc() {
        let src = this.frame.src;
        try {
            const { contentWindow } = this.frame;
            if (contentWindow) {
                src = contentWindow.location.href;
            }
        } catch {
            // CORS issue. Ignored.
        }
        if (src === 'about:blank') {
            src = '';
        }
        return src;
    }

    protected contentDocument(): Document | null {
        try {
            let { contentDocument } = this.frame;
            if (contentDocument === null) {
                const { contentWindow } = this.frame;
                if (contentWindow) {
                    contentDocument = contentWindow.document;
                }
            }
            return contentDocument;
        } catch {
            // tslint:disable-next-line:no-null-keyword
            return null;
        }
    }

    protected async go(location: string, options?: Partial<{
        /* default: true */
        showLoadIndicator: boolean,
        /* default: true */
        preserveFocus: boolean
    }>): Promise<void> {
        const { showLoadIndicator, preserveFocus } = {
            showLoadIndicator: true,
            preserveFocus: true,
            ...options
        };
        if (location) {
            try {
                this.toDisposeOnGo.dispose();
                const url = await this.mapLocation(location);
                this.setInput(url);
                if (this.getToolbarProps() === 'read-only') {
                    this.input.title = `Open ${url} In A New Window`;
                }
                clearTimeout(this.frameLoadTimeout);
                this.frameLoadTimeout = window.setTimeout(this.onFrameTimeout.bind(this), 3000);
                if (showLoadIndicator) {
                    this.showLoadIndicator();
                }
                if (url.endsWith('.pdf')) {
                    this.pdfContainer.style.display = 'block';
                    this.frame.style.display = 'none';
                    PDFObject.embed(url, this.pdfContainer, {
                        // tslint:disable-next-line:max-line-length quotemark
                        fallbackLink: `<p style="padding: 0px 15px 0px 15px">Your browser does not support inline PDFs. Click on this <a href='[url]' target="_blank">link</a> to open the PDF in a new tab.</p>`
                    });
                    clearTimeout(this.frameLoadTimeout);
                    this.hideLoadIndicator();
                    if (!preserveFocus) {
                        this.pdfContainer.focus();
                    }
                } else {
                    this.pdfContainer.style.display = 'none';
                    this.frame.style.display = 'block';
                    this.frame.src = url;
                    // The load indicator will hide itself if the content of the iframe was loaded.
                    if (!preserveFocus) {
                        this.frame.addEventListener('load', () => {
                            const window = this.frame.contentWindow;
                            if (window) {
                                window.focus();
                            }
                        }, { once: true });
                    }
                }
                // Delegate all the `keypress` events from the `iframe` to the application.
                this.toDisposeOnGo.push(addEventListener(this.frame, 'load', () => {
                    try {
                        const { contentDocument } = this.frame;
                        if (contentDocument) {
                            const keypressHandler = (e: KeyboardEvent) => this.keybindings.run(e);
                            contentDocument.addEventListener('keypress', keypressHandler, true);
                            this.toDisposeOnDetach.push(Disposable.create(() => contentDocument.removeEventListener('keypress', keypressHandler)));
                        }
                    } catch {
                        // There is not much we could do with the security exceptions due to CORS.
                    }
                }));
            } catch (e) {
                clearTimeout(this.frameLoadTimeout);
                this.hideLoadIndicator();
                this.showErrorBar(String(e));
                console.log(e);
            }
        }
    }

}

export namespace MiniBrowserContent {

    export namespace Styles {

        export const MINI_BROWSER = 'theia-mini-browser';
        export const TOOLBAR = 'theia-mini-browser-toolbar';
        export const TOOLBAR_READ_ONLY = 'theia-mini-browser-toolbar-read-only';
        export const PRE_LOAD = 'theia-mini-browser-load-indicator';
        export const FADE_OUT = 'theia-fade-out';
        export const CONTENT_AREA = 'theia-mini-browser-content-area';
        export const PDF_CONTAINER = 'theia-mini-browser-pdf-container';
        export const PREVIOUS = 'theia-mini-browser-previous';
        export const NEXT = 'theia-mini-browser-next';
        export const REFRESH = 'theia-mini-browser-refresh';
        export const OPEN = 'theia-mini-browser-open';
        export const BUTTON = 'theia-mini-browser-button';
        export const DISABLED = 'theia-mini-browser-button-disabled';
        export const TRANSPARENT_OVERLAY = 'theia-mini-browser-transparent-overlay';
        export const ERROR_BAR = 'theia-mini-browser-error-bar';

    }

}
