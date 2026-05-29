// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
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
        // Prepend so the mic sits before the send / token-usage indicator without disturbing layout.
        toolbar.insertBefore(button, toolbar.firstChild);
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
        this.injectPlainInputMicButton(
            wrap,
            'input.theia-mobile-projects-sticky-composer-input',
            'qaap-chat-mic-btn-sticky',
            false,
        );
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
        const input = wrap.querySelector<HTMLInputElement>(inputSelector);
        if (!input) {
            return;
        }
        const button = this.buildButton();
        button.classList.add(layoutClass);
        if (useInlinePadding) {
            wrap.classList.add('qaap-has-mic');
        }
        this.wireInlineRecognition(button, input);
        const send = wrap.querySelector<HTMLElement>(
            '.theia-mobile-projects-sticky-composer-send, .theia-mobile-projects-inline-start',
        );
        if (send) {
            wrap.insertBefore(button, send);
        } else {
            wrap.appendChild(button);
        }
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
        let baseline = '';
        let detachObserver: MutationObserver | undefined;

        const stop = (): void => {
            if (recognition) {
                try { recognition.onend = null; recognition.onresult = null; recognition.onerror = null; recognition.stop(); } catch { /* idempotent */ }
                recognition = undefined;
            }
            detachObserver?.disconnect();
            detachObserver = undefined;
            this.markButtonIdle(button);
        };

        const start = (): void => {
            const editor = this.findEditorForInput(chatInput);
            if (!editor) {
                return;
            }
            try {
                recognition = new Ctor();
            } catch {
                return;
            }
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = this.preferredLang();
            // Snapshot current text so each `onresult` replaces only the dictated portion. Without this
            // every interim result would re-append the same words and produce duplicated output.
            const model = editor.getModel();
            baseline = model?.getValue() ?? '';
            const trailingSpace = baseline.length > 0 && !/\s$/.test(baseline) ? ' ' : '';

            recognition.onresult = (event: SpeechRecognitionEvent) => {
                if (!button.isConnected) {
                    stop();
                    return;
                }
                let transcript = '';
                for (let i = 0; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                this.replaceInputText(editor, baseline + trailingSpace + transcript);
            };
            recognition.onerror = () => stop();
            recognition.onend = () => stop();
            try {
                recognition.start();
                this.markButtonActive(button);
            } catch {
                stop();
                return;
            }
            // Set up detach observer after recognition starts successfully (button is in DOM by now).
            if (typeof MutationObserver !== 'undefined') {
                detachObserver = new MutationObserver(() => {
                    if (!button.isConnected) {
                        stop();
                    }
                });
                detachObserver.observe(document.body, { childList: true, subtree: true });
            }
        };

        const toggle = (): void => {
            if (recognition) {
                stop();
            } else {
                start();
            }
        };

        this.wireToggleHandlers(button, toggle);
        this.toDispose.push(Disposable.create(() => stop()));
    }

    protected wireInlineRecognition(button: HTMLButtonElement, input: HTMLInputElement): void {
        const Ctor = this.getSpeechRecognitionCtor();
        if (!Ctor) {
            return;
        }
        let recognition: SpeechRecognition | undefined;
        let baseline = '';
        let detachObserver: MutationObserver | undefined;

        const stop = (): void => {
            if (recognition) {
                try { recognition.onend = null; recognition.onresult = null; recognition.onerror = null; recognition.stop(); } catch { /* idempotent */ }
                recognition = undefined;
            }
            detachObserver?.disconnect();
            detachObserver = undefined;
            this.markButtonIdle(button);
        };

        const start = (): void => {
            // Re-resolve the live input from the wrap in case the DOM was remounted since wire time.
            const wrap = button.parentElement;
            const liveInput = wrap?.querySelector<HTMLInputElement>(
                'input.theia-mobile-projects-sticky-composer-input, input.theia-mobile-projects-inline-input'
            ) ?? input;

            try {
                recognition = new Ctor();
            } catch {
                return;
            }
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = this.preferredLang();
            baseline = liveInput.value;
            const trailingSpace = baseline.length > 0 && !/\s$/.test(baseline) ? ' ' : '';

            recognition.onresult = (event: SpeechRecognitionEvent) => {
                if (!button.isConnected) {
                    stop();
                    return;
                }
                let transcript = '';
                for (let i = 0; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                liveInput.value = baseline + trailingSpace + transcript;
                // Notify the inline-composer listeners (enable/disable Start button, draft persistence).
                liveInput.dispatchEvent(new Event('input', { bubbles: true }));
            };
            recognition.onerror = () => stop();
            recognition.onend = () => stop();
            try {
                recognition.start();
                this.markButtonActive(button);
            } catch {
                stop();
                return;
            }
            // Set up detach observer after recognition starts successfully (button is in DOM by now).
            if (typeof MutationObserver !== 'undefined') {
                detachObserver = new MutationObserver(() => {
                    if (!button.isConnected) {
                        stop();
                    }
                });
                detachObserver.observe(document.body, { childList: true, subtree: true });
            }
        };

        const toggle = (): void => {
            if (recognition) {
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

/* eslint-disable @typescript-eslint/no-explicit-any */
interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: any) => void) | null;
    onend: ((event: any) => void) | null;
    start(): void;
    stop(): void;
}

interface SpeechRecognitionEvent {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
