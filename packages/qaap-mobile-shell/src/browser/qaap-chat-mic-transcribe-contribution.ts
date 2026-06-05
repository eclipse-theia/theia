// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { matchesMobileOneColumnLayout } from '@theia/core/lib/browser/shell/mobile-layout-state';
import { nls } from '@theia/core/lib/common/nls';
import * as monaco from '@theia/monaco-editor-core';

/**
 * Injects a microphone toggle into every AI chat input toolbar so the user can dictate the prompt
 * via the browser's SpeechRecognition API. The button is added via DOM observation rather than by
 * modifying the upstream `AIChatInputWidget` render — that keeps the drift surface to a single new
 * file in the Qaap layer and survives every chat-input variant (workspace ChatView, mobile project
 * card, future ones) automatically.
 */
@injectable()
export class QaapChatMicTranscribeContribution implements FrontendApplicationContribution {

    protected static readonly BUTTON_CLASS = 'qaap-chat-mic-btn';
    protected static readonly TOOLBAR_SELECTOR = '.theia-ChatInputOptions-right';
    protected static readonly INLINE_WRAP_SELECTOR = '.theia-mobile-projects-inline-input-wrap';
    protected static readonly STICKY_WRAP_SELECTOR = '.theia-mobile-projects-sticky-composer-input-wrap';
    protected static readonly STICKY_CONTROLS_SELECTOR = '.theia-mobile-projects-sticky-composer-input-actions';
    protected static readonly PLAIN_INPUT_SELECTOR =
        'textarea.theia-mobile-projects-sticky-composer-input, input.theia-mobile-projects-sticky-composer-input, input.theia-mobile-projects-inline-input';
    protected static readonly STICKY_FIELD_SELECTOR = '.theia-mobile-projects-sticky-composer-input';

    protected readonly toDispose = new DisposableCollection();
    protected observer: MutationObserver | undefined;

    onStart(): void {
        if (typeof document === 'undefined' || !this.isSpeechRecognitionSupported()) {
            return;
        }
        const sweep = (root: ParentNode): void => {
            root.querySelectorAll?.<HTMLElement>(QaapChatMicTranscribeContribution.TOOLBAR_SELECTOR)
                .forEach(toolbar => this.injectButton(toolbar));
            root.querySelectorAll?.<HTMLElement>(QaapChatMicTranscribeContribution.INLINE_WRAP_SELECTOR)
                .forEach(wrap => this.injectInlineButton(wrap));
            root.querySelectorAll?.<HTMLElement>(QaapChatMicTranscribeContribution.STICKY_WRAP_SELECTOR)
                .forEach(wrap => this.injectStickyButton(wrap));
            root.querySelectorAll?.<HTMLElement>(QaapChatMicTranscribeContribution.STICKY_CONTROLS_SELECTOR)
                .forEach(row => this.injectStickyControlsButton(row));
        };
        sweep(document);

        this.observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach(node => {
                    if (!(node instanceof HTMLElement)) {
                        return;
                    }
                    if (node.matches?.(QaapChatMicTranscribeContribution.TOOLBAR_SELECTOR)) {
                        this.injectButton(node);
                    }
                    if (node.matches?.(QaapChatMicTranscribeContribution.INLINE_WRAP_SELECTOR)) {
                        this.injectInlineButton(node);
                    }
                    if (node.matches?.(QaapChatMicTranscribeContribution.STICKY_WRAP_SELECTOR)) {
                        this.injectStickyButton(node);
                    }
                    if (node.matches?.(QaapChatMicTranscribeContribution.STICKY_CONTROLS_SELECTOR)) {
                        this.injectStickyControlsButton(node);
                    }
                    sweep(node);
                });
            }
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.toDispose.push(Disposable.create(() => {
            this.observer?.disconnect();
            this.observer = undefined;
        }));
    }

    onStop(): void {
        this.toDispose.dispose();
    }

    protected injectButton(toolbar: HTMLElement): void {
        if (toolbar.querySelector(`.${QaapChatMicTranscribeContribution.BUTTON_CLASS}`)) {
            return;
        }
        const chatInput = toolbar.closest('.theia-ChatInput');
        if (!(chatInput instanceof HTMLElement)) {
            return;
        }
        const button = this.buildButton();
        this.wireRecognition(button, chatInput);
        this.placeMicBeforeSend(toolbar, button);
    }

    protected injectInlineButton(wrap: HTMLElement): void {
        this.injectPlainInputMicButton(
            wrap,
            'input.theia-mobile-projects-inline-input',
            'qaap-chat-mic-btn-inline',
            true,
        );
    }

    protected injectStickyButton(wrap: HTMLElement): void {
        const controls = wrap.querySelector<HTMLElement>(QaapChatMicTranscribeContribution.STICKY_CONTROLS_SELECTOR)
            ?? wrap.querySelector<HTMLElement>('.theia-mobile-projects-sticky-composer-input-body');
        if (controls) {
            this.injectStickyControlsButton(controls);
            return;
        }
        this.injectPlainInputMicButton(
            wrap,
            'input.theia-mobile-projects-sticky-composer-input',
            'qaap-chat-mic-btn-sticky',
            false,
        );
    }

    protected injectStickyControlsButton(row: HTMLElement): void {
        const existing = row.querySelector<HTMLButtonElement>(`.${QaapChatMicTranscribeContribution.BUTTON_CLASS}`);
        if (existing) {
            this.placeMicBeforeSend(row, existing);
            return;
        }
        const wrap = row.closest<HTMLElement>(QaapChatMicTranscribeContribution.STICKY_WRAP_SELECTOR);
        const field = wrap?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            QaapChatMicTranscribeContribution.STICKY_FIELD_SELECTOR,
        );
        if (!field) {
            return;
        }
        const button = this.buildButton();
        button.classList.add('qaap-chat-mic-btn-sticky');
        this.wireInlineRecognition(button, field);
        this.placeMicBeforeSend(row, button);
    }

    /** Mic immediately precedes send (Codex: mic · send on the controls row, right side). */
    protected placeMicBeforeSend(container: HTMLElement, mic: HTMLElement): void {
        const send = this.findSendControl(container);
        if (send) {
            container.insertBefore(mic, send);
        } else {
            container.appendChild(mic);
        }
    }

    protected findSendControl(container: HTMLElement): HTMLElement | undefined {
        const stickySend = container.querySelector<HTMLElement>('.theia-mobile-projects-sticky-composer-send');
        if (stickySend) {
            return stickySend;
        }
        for (const option of container.querySelectorAll<HTMLElement>('.option')) {
            if (option.classList.contains(QaapChatMicTranscribeContribution.BUTTON_CLASS)) {
                continue;
            }
            if (option.querySelector('.codicon-send')) {
                return option;
            }
        }
        return undefined;
    }

    protected injectPlainInputMicButton(
        wrap: HTMLElement,
        inputSelector: string,
        layoutClass: string,
        useInlinePadding: boolean,
    ): void {
        if (wrap.querySelector(`.${QaapChatMicTranscribeContribution.BUTTON_CLASS}`)) {
            return;
        }
        const input = wrap.querySelector<HTMLInputElement | HTMLTextAreaElement>(inputSelector);
        if (!input) {
            return;
        }
        const button = this.buildButton();
        button.classList.add(layoutClass);
        if (useInlinePadding) {
            wrap.classList.add('qaap-has-mic');
        }
        this.wireInlineRecognition(button, input);
        const sendHost = wrap.querySelector<HTMLElement>(QaapChatMicTranscribeContribution.STICKY_CONTROLS_SELECTOR) ?? wrap;
        this.placeMicBeforeSend(sendHost, button);
    }

    protected buildButton(): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.classList.add('option', QaapChatMicTranscribeContribution.BUTTON_CLASS);
        const startLabel = nls.localize('qaap/chat/micStart', 'Dictate with microphone');
        button.setAttribute('aria-label', startLabel);
        button.title = startLabel;
        button.setAttribute('aria-pressed', 'false');
        const icon = document.createElement('span');
        icon.className = 'codicon codicon-mic';
        icon.setAttribute('aria-hidden', 'true');
        button.appendChild(icon);
        return button;
    }

    protected wireRecognition(button: HTMLButtonElement, chatInput: HTMLElement): void {
        const Ctor = this.getSpeechRecognitionCtor();
        if (!Ctor) {
            return;
        }
        let recognition: SpeechRecognition | undefined;
        let sessionActive = false;
        let userStopped = false;
        let baseline = '';
        let trailingSpace = '';
        let detachObserver: MutationObserver | undefined;

        const refreshBaseline = (): void => {
            const editor = this.findEditorForInput(chatInput);
            const model = editor?.getModel();
            baseline = model?.getValue() ?? '';
            trailingSpace = this.trailingSpaceForBaseline(baseline);
        };

        const endSession = (): void => {
            sessionActive = false;
            userStopped = false;
            if (recognition) {
                try {
                    recognition.onend = null;
                    recognition.onresult = null;
                    recognition.onerror = null;
                    recognition.stop();
                } catch { /* idempotent */ }
                recognition = undefined;
            }
            detachObserver?.disconnect();
            detachObserver = undefined;
            this.markButtonIdle(button);
        };

        const stop = (): void => {
            userStopped = true;
            endSession();
        };

        const applyTranscript = (transcript: string): void => {
            const editor = this.findEditorForInput(chatInput);
            if (!editor) {
                return;
            }
            this.replaceInputText(editor, baseline + trailingSpace + transcript);
        };

        const beginRecognition = (): boolean => {
            refreshBaseline();
            try {
                const rec = new Ctor();
                recognition = rec;
                rec.continuous = true;
                rec.interimResults = true;
                rec.lang = this.preferredLang();
                rec.onresult = (event: SpeechRecognitionEvent) => {
                    if (!sessionActive || !button.isConnected) {
                        stop();
                        return;
                    }
                    applyTranscript(this.buildTranscriptFromEvent(event));
                };
                rec.onerror = (event: SpeechRecognitionErrorEvent) => {
                    const error = event.error;
                    if (userStopped || this.isFatalSpeechError(error)) {
                        stop();
                    }
                    // Recoverable errors (no-speech while pausing) are handled by onend restart on mobile.
                };
                rec.onend = () => {
                    recognition = undefined;
                    if (!sessionActive || userStopped || !button.isConnected) {
                        endSession();
                        return;
                    }
                    if (this.isMobileDictationDevice()) {
                        if (!beginRecognition()) {
                            endSession();
                        }
                        return;
                    }
                    endSession();
                };
                rec.start();
                return true;
            } catch {
                recognition = undefined;
                return false;
            }
        };

        const startSession = (): void => {
            sessionActive = true;
            userStopped = false;
            if (!beginRecognition()) {
                endSession();
                return;
            }
            this.markButtonActive(button);
            if (typeof MutationObserver !== 'undefined' && !detachObserver) {
                detachObserver = new MutationObserver(() => {
                    if (!button.isConnected) {
                        stop();
                    }
                });
                detachObserver.observe(document.body, { childList: true, subtree: true });
            }
        };

        const start = (): void => {
            const editor = this.findEditorForInput(chatInput);
            if (editor) {
                startSession();
                return;
            }
            // Monaco may not be mounted yet when the mic button is tapped on mobile.
            let attempts = 0;
            const retry = (): void => {
                if (!button.isConnected || sessionActive) {
                    return;
                }
                if (this.findEditorForInput(chatInput)) {
                    startSession();
                    return;
                }
                if (++attempts < 20) {
                    requestAnimationFrame(retry);
                }
            };
            requestAnimationFrame(retry);
        };

        const toggle = (): void => {
            if (sessionActive) {
                stop();
            } else {
                start();
            }
        };

        this.wireToggleHandlers(button, toggle);
        this.toDispose.push(Disposable.create(() => stop()));
    }

    protected wireInlineRecognition(button: HTMLButtonElement, input: HTMLInputElement | HTMLTextAreaElement): void {
        const Ctor = this.getSpeechRecognitionCtor();
        if (!Ctor) {
            return;
        }
        let recognition: SpeechRecognition | undefined;
        let sessionActive = false;
        let userStopped = false;
        let baseline = '';
        let trailingSpace = '';
        let detachObserver: MutationObserver | undefined;

        const resolveInput = (): HTMLInputElement | HTMLTextAreaElement | undefined =>
            this.resolvePlainComposerInput(button, input);

        const refreshBaseline = (): void => {
            const liveInput = resolveInput();
            baseline = liveInput?.value ?? '';
            trailingSpace = this.trailingSpaceForBaseline(baseline);
        };

        const endSession = (): void => {
            sessionActive = false;
            userStopped = false;
            if (recognition) {
                try {
                    recognition.onend = null;
                    recognition.onresult = null;
                    recognition.onerror = null;
                    recognition.stop();
                } catch { /* idempotent */ }
                recognition = undefined;
            }
            detachObserver?.disconnect();
            detachObserver = undefined;
            this.markButtonIdle(button);
        };

        const stop = (): void => {
            userStopped = true;
            endSession();
        };

        const applyTranscript = (transcript: string): void => {
            const liveInput = resolveInput();
            if (!liveInput) {
                return;
            }
            this.applyPlainInputText(liveInput, baseline + trailingSpace + transcript);
        };

        const beginRecognition = (): boolean => {
            refreshBaseline();
            try {
                const rec = new Ctor();
                recognition = rec;
                rec.continuous = true;
                rec.interimResults = true;
                rec.lang = this.preferredLang();
                rec.onresult = (event: SpeechRecognitionEvent) => {
                    if (!sessionActive || !button.isConnected) {
                        stop();
                        return;
                    }
                    applyTranscript(this.buildTranscriptFromEvent(event));
                };
                rec.onerror = (event: SpeechRecognitionErrorEvent) => {
                    const error = event.error;
                    if (userStopped || this.isFatalSpeechError(error)) {
                        stop();
                    }
                };
                rec.onend = () => {
                    recognition = undefined;
                    if (!sessionActive || userStopped || !button.isConnected) {
                        endSession();
                        return;
                    }
                    if (this.isMobileDictationDevice()) {
                        if (!beginRecognition()) {
                            endSession();
                        }
                        return;
                    }
                    endSession();
                };
                rec.start();
                return true;
            } catch {
                recognition = undefined;
                return false;
            }
        };

        const start = (): void => {
            if (!resolveInput()) {
                return;
            }
            sessionActive = true;
            userStopped = false;
            if (!beginRecognition()) {
                endSession();
                return;
            }
            this.markButtonActive(button);
            if (typeof MutationObserver !== 'undefined' && !detachObserver) {
                detachObserver = new MutationObserver(() => {
                    if (!button.isConnected) {
                        stop();
                    }
                });
                detachObserver.observe(document.body, { childList: true, subtree: true });
            }
        };

        const toggle = (): void => {
            if (sessionActive) {
                stop();
            } else {
                start();
            }
        };

        this.wireToggleHandlers(button, toggle);
        this.toDispose.push(Disposable.create(() => stop()));
    }

    /**
     * Native {@link HTMLButtonElement} plus {@link stopPropagation} on pointerdown so parent scroll /
     * card handlers do not swallow the tap on mobile (inline composer and chat toolbar).
     */
    protected wireToggleHandlers(button: HTMLButtonElement, toggle: () => void): void {
        const activate = (evt: Event): void => {
            evt.preventDefault();
            evt.stopPropagation();
            toggle();
        };
        button.addEventListener('pointerdown', evt => evt.stopPropagation());
        button.addEventListener('click', activate);
        button.addEventListener('keydown', evt => {
            if (evt.key === 'Enter' || evt.key === ' ') {
                activate(evt);
            }
        });
    }

    protected buildTranscriptFromEvent(event: SpeechRecognitionEvent): string {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0]?.transcript ?? '';
        }
        return transcript;
    }

    protected trailingSpaceForBaseline(baseline: string): string {
        return baseline.length > 0 && !/\s$/.test(baseline) ? ' ' : '';
    }

    protected resolvePlainComposerInput(
        button: HTMLButtonElement,
        fallback: HTMLInputElement | HTMLTextAreaElement,
    ): HTMLInputElement | HTMLTextAreaElement | undefined {
        const wrap = button.closest(QaapChatMicTranscribeContribution.STICKY_WRAP_SELECTOR)
            ?? button.parentElement;
        const liveInput = wrap?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
            QaapChatMicTranscribeContribution.PLAIN_INPUT_SELECTOR,
        );
        if (liveInput?.isConnected) {
            return liveInput;
        }
        return fallback.isConnected ? fallback : undefined;
    }

    protected applyPlainInputText(input: HTMLInputElement | HTMLTextAreaElement, text: string): void {
        if (input.value === text) {
            return;
        }
        input.value = text;
        const end = text.length;
        try {
            input.setSelectionRange(end, end);
        } catch { /* some input types omit selection APIs */ }
        if (typeof InputEvent !== 'undefined') {
            input.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertFromDictation',
                data: text,
            }));
        } else {
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    protected isMobileDictationDevice(): boolean {
        if (typeof window === 'undefined') {
            return false;
        }
        return matchesMobileOneColumnLayout();
    }

    protected isFatalSpeechError(error: string | undefined): boolean {
        return error === 'not-allowed'
            || error === 'service-not-allowed'
            || error === 'audio-capture'
            || error === 'network';
    }

    protected replaceInputText(editor: monaco.editor.ICodeEditor, text: string): void {
        const model = editor.getModel();
        if (!model) {
            return;
        }
        // Use a normal edit so undo/redo and change listeners (token counter, history, etc.) all fire
        // exactly the way they do when the user types.
        const fullRange = model.getFullModelRange();
        editor.executeEdits('qaap-mic', [{ range: fullRange, text, forceMoveMarkers: true }]);
        const endLine = model.getLineCount();
        const endCol = model.getLineMaxColumn(endLine);
        editor.setPosition({ lineNumber: endLine, column: endCol });
    }

    protected findEditorForInput(chatInput: HTMLElement): monaco.editor.ICodeEditor | undefined {
        return monaco.editor.getEditors().find(editor => {
            const domNode = editor.getDomNode();
            return !!domNode && chatInput.contains(domNode);
        });
    }

    protected markButtonActive(button: HTMLButtonElement): void {
        button.classList.add('qaap-chat-mic-btn-recording');
        button.setAttribute('aria-pressed', 'true');
        const stopLabel = nls.localize('qaap/chat/micStop', 'Stop dictation');
        button.setAttribute('aria-label', stopLabel);
        button.title = stopLabel;
        const icon = button.querySelector('.codicon');
        if (icon) {
            icon.classList.remove('codicon-mic');
            icon.classList.add('codicon-stop-circle');
        }
    }

    protected markButtonIdle(button: HTMLButtonElement): void {
        button.classList.remove('qaap-chat-mic-btn-recording');
        button.setAttribute('aria-pressed', 'false');
        const startLabel = nls.localize('qaap/chat/micStart', 'Dictate with microphone');
        button.setAttribute('aria-label', startLabel);
        button.title = startLabel;
        const icon = button.querySelector('.codicon');
        if (icon) {
            icon.classList.remove('codicon-stop-circle');
            icon.classList.add('codicon-mic');
        }
    }

    protected preferredLang(): string {
        if (typeof navigator !== 'undefined' && navigator.language) {
            return navigator.language;
        }
        return 'en-US';
    }

    protected isSpeechRecognitionSupported(): boolean {
        return !!this.getSpeechRecognitionCtor();
    }

    protected getSpeechRecognitionCtor(): { new(): SpeechRecognition } | undefined {
        if (typeof window === 'undefined') {
            return undefined;
        }
        const w = window as unknown as {
            SpeechRecognition?: { new(): SpeechRecognition };
            webkitSpeechRecognition?: { new(): SpeechRecognition };
        };
        return w.SpeechRecognition ?? w.webkitSpeechRecognition;
    }
}

interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: ((event: Event) => void) | null;
    start(): void;
    stop(): void;
}

interface SpeechRecognitionEvent {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
}
