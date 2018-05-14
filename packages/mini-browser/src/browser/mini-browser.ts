/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as PDFObject from 'pdfobject';
import { inject, injectable, postConstruct } from 'inversify';
import { Message } from '@phosphor/messaging';
import { PanelLayout, SplitPanel } from '@phosphor/widgets';
import URI from '@theia/core/lib/common/uri';
import { ILogger } from '@theia/core/lib/common/logger';
import { Key, KeyCode } from '@theia/core/lib/browser/keys';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { FileSystem } from '@theia/filesystem/lib/common/filesystem';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { FrontendApplicationContribution, ApplicationShell } from '@theia/core/lib/browser';
import { FileSystemWatcher, FileChangeType, FileChange } from '@theia/filesystem/lib/browser/filesystem-watcher';
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

@injectable()
export class MiniBrowser extends BaseWidget {

    private static ID = 0;
    private static ICON = 'fa fa-globe';

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
    protected readonly openEmitter = new Emitter<void>();

    protected readonly input: HTMLInputElement;
    protected readonly loadIndicator: HTMLElement;
    protected readonly frame: HTMLIFrameElement;
    // tslint:disable-next-line:max-line-length
    // XXX This is a hack to be able to tack the mouse events when drag and dropping the widgets. On `mousedown` we put a transparent div over the `iframe` to avoid losing the mouse tacking.
    protected readonly transparentOverlay: HTMLElement;
    // XXX It is a hack. Instead of loading the PDF in an iframe we use `PDFObject` to render it in a div.
    protected readonly pdfContainer: HTMLElement;

    protected readonly initialHistoryLength: number;

    constructor(@inject(MiniBrowserProps) protected readonly props: MiniBrowserProps) {
        super();
        this.id = `theia-mini-browser-${MiniBrowser.ID++}`;
        this.title.closable = true;
        this.title.caption = this.title.label = this.props.name || 'Browser';
        this.title.iconClass = this.props.iconClass || MiniBrowser.ICON;
        this.addClass(MiniBrowser.Styles.MINI_BROWSER);
        this.input = this.createToolbar(this.node).input;
        const contentArea = this.createContentArea(this.node);
        this.frame = contentArea.frame;
        this.transparentOverlay = contentArea.transparentOverlay;
        this.loadIndicator = contentArea.loadIndicator;
        this.pdfContainer = contentArea.pdfContainer;
        this.initialHistoryLength = history.length;
        this.toDispose.pushAll([
            this.submitInputEmitter,
            this.navigateBackEmitter,
            this.navigateForwardEmitter,
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
            setTimeout(() => this.go(startPage, true), 500);
            this.listenOnContentChange(startPage);
        }
    }

    onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        (this.getToolbarProps() !== 'hide' ? this.input : this.frame).focus();
        this.update();
    }

    protected async listenOnContentChange(location: string): Promise<void> {
        if (location.startsWith('file://')) {
            if (await this.fileSystem.exists(location)) {
                const fileUri = new URI(location);
                const watcher = await this.fileSystemWatcher.watchFileChanges(fileUri);
                this.toDispose.push(watcher);
                const onFileChange = (e: FileChange[]) => {
                    if (e.some(change => change.uri.toString() === fileUri.toString() && change.type !== FileChangeType.DELETED)) {
                        this.go(location, false, false);
                    }
                };
                this.toDispose.push(this.fileSystemWatcher.onFilesChanged(debounce(onFileChange, 500)));
            }
        }
    }

    protected createToolbar(parent: HTMLElement): HTMLDivElement & Readonly<{ input: HTMLInputElement }> {
        const toolbar = document.createElement('div');
        toolbar.classList.add(this.getToolbarProps() === 'read-only' ? MiniBrowser.Styles.TOOLBAR_READ_ONLY : MiniBrowser.Styles.TOOLBAR);
        parent.appendChild(toolbar);
        this.createPrevious(toolbar);
        this.createNext(toolbar);
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
    protected createContentArea(parent: HTMLElement): HTMLElement & Readonly<{ frame: HTMLIFrameElement, loadIndicator: HTMLElement, pdfContainer: HTMLElement, transparentOverlay: HTMLElement }> {
        const contentArea = document.createElement('div');
        contentArea.classList.add(MiniBrowser.Styles.CONTENT_AREA);

        const loadIndicator = document.createElement('div');
        loadIndicator.classList.add(MiniBrowser.Styles.PRE_LOAD);
        loadIndicator.style.display = 'none';

        const frame = this.createIFrame();
        this.submitInputEmitter.event(input => this.go(input, true));
        this.navigateBackEmitter.event(this.handleBack.bind(this));
        this.navigateForwardEmitter.event(this.handleForward.bind(this));
        this.openEmitter.event(this.handleOpen.bind(this));

        const transparentOverlay = document.createElement('div');
        transparentOverlay.classList.add(MiniBrowser.Styles.TRANSPARENT_OVERLAY);
        transparentOverlay.style.display = 'none';

        const pdfContainer = document.createElement('div');
        pdfContainer.classList.add(MiniBrowser.Styles.PDF_CONTAINER);
        pdfContainer.id = `${this.id}-pdf-container`;
        pdfContainer.style.display = 'none';

        contentArea.appendChild(transparentOverlay);
        contentArea.appendChild(pdfContainer);
        contentArea.appendChild(loadIndicator);
        contentArea.appendChild(frame);

        parent.appendChild(contentArea);
        return Object.assign(contentArea, { frame, loadIndicator, pdfContainer, transparentOverlay });
    }

    protected createIFrame(): HTMLIFrameElement {
        const frame = document.createElement('iframe');
        const sandbox = (this.props.sandbox || MiniBrowserProps.SandboxOptions.DEFAULT).map(name => MiniBrowserProps.SandboxOptions[name]);
        frame.sandbox.add(...sandbox);
        this.toDispose.push(addEventListener(frame, 'load', this.onFrameLoad.bind(this)));
        return frame;
    }

    protected onFrameLoad(): void {
        this.hideLoadIndicator();
        this.focus();
    }

    protected focus(): void {
        const contentDocument = this.contentDocument();
        if (contentDocument !== null) {
            contentDocument.body.focus();
        } else {
            this.input.focus();
        }
    }

    protected showLoadIndicator(): void {
        this.loadIndicator.style.display = 'block';
    }

    protected hideLoadIndicator(): void {
        this.loadIndicator.style.display = 'none';
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
        const button = this.onClick(this.createButton(parent, 'Show The Previous Page', MiniBrowser.Styles.PREVIOUS), this.navigateBackEmitter);
        return button;
    }

    protected createNext(parent: HTMLElement): HTMLElement {
        const button = this.onClick(this.createButton(parent, 'Show The Next Page', MiniBrowser.Styles.NEXT), this.navigateForwardEmitter);
        return button;
    }

    protected createOpen(parent: HTMLElement): HTMLElement {
        const button = this.onClick(this.createButton(parent, 'Open In A New Window', MiniBrowser.Styles.OPEN), this.openEmitter);
        return button;
    }

    protected createButton(parent: HTMLElement, title: string, ...className: string[]): HTMLElement {
        const button = document.createElement('div');
        button.title = title;
        button.classList.add(...className, MiniBrowser.Styles.BUTTON);
        parent.appendChild(button);
        return button;
    }

    // tslint:disable-next-line:no-any
    protected onClick(element: HTMLElement, emitter: Emitter<any>): HTMLElement {
        this.toDispose.push(addEventListener(element, 'click', () => {
            if (!element.classList.contains(MiniBrowser.Styles.DISABLED)) {
                emitter.fire(undefined);
            }
        }));
        return element;
    }

    protected mapLocation(location: string): Promise<string> {
        return this.locationMapper.map(location);
    }

    protected setInput(value: string) {
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

    protected async go(location: string, register: boolean = false, showLoadIndicator: boolean = true): Promise<void> {
        if (location) {
            try {
                const url = await this.mapLocation(location);
                this.setInput(url);
                if (this.getToolbarProps() === 'read-only') {
                    this.input.title = `Open ${url} In A New Window`;
                }
                if (showLoadIndicator) {
                    this.showLoadIndicator();
                }
                if (url.endsWith('.pdf')) {
                    this.pdfContainer.style.display = 'block';
                    this.frame.style.display = 'none';
                    PDFObject.embed(url, this.pdfContainer, {
                        // tslint:disable-next-line:max-line-length
                        fallbackLink: `<p style="padding: 0px 15px 0px 15px">Your browser does not support inline PDFs. Click on this <a href='[url]' target="_blank">link</a> to open the PDF in a new tab.</p>`
                    });
                    this.hideLoadIndicator();
                } else {
                    this.frame.addEventListener('load', () => this.frame.style.backgroundColor = 'white', { once: true });
                    this.pdfContainer.style.display = 'none';
                    this.frame.style.display = 'block';
                    this.frame.src = url;
                    // The load indicator will hide itself if the content of the iframe was loaded.
                }
            } catch (e) {
                this.hideLoadIndicator();
                console.log(e);
            }
        }
    }

}

export namespace MiniBrowser {

    export namespace Styles {

        export const MINI_BROWSER = 'theia-mini-browser';
        export const TOOLBAR = 'theia-mini-browser-toolbar';
        export const TOOLBAR_READ_ONLY = 'theia-mini-browser-toolbar-read-only';
        export const PRE_LOAD = 'theia-mini-browser-load-indicator';
        export const CONTENT_AREA = 'theia-mini-browser-content-area';
        export const PDF_CONTAINER = 'theia-mini-browser-pdf-container';
        export const PREVIOUS = 'theia-mini-browser-previous';
        export const NEXT = 'theia-mini-browser-next';
        export const REFRESH = 'theia-mini-browser-refresh';
        export const OPEN = 'theia-mini-browser-open';
        export const BUTTON = 'theia-mini-browser-button';
        export const DISABLED = 'theia-mini-browser-button-disabled';
        export const TRANSPARENT_OVERLAY = 'theia-mini-browser-transparent-overlay';

    }

    export namespace Factory {

        export const ID = 'mini-browser-factory';

    }

}
