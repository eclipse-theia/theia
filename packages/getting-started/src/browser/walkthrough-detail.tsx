// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import * as DOMPurify from '@theia/core/shared/dompurify';
import { codicon } from '@theia/core/lib/browser';
import { MarkdownRenderer, MarkdownRenderOptions, MarkdownRenderResult } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import { ILogger } from '@theia/core/lib/common/logger';
import { ThemeType } from '@theia/core/lib/common/theme';
import * as React from '@theia/core/shared/react';
import { Walkthrough, WalkthroughStep } from '../common/walkthrough-types';
import { PluginSharedStyle } from '@theia/plugin-ext/lib/main/browser/plugin-shared-style';
import { WalkthroughIcon } from './walkthrough-icon';

export interface WalkthroughDetailProps {
    walkthrough: Walkthrough;
    onStepSelect: (step: WalkthroughStep) => void;
    onBack: () => void;
    selectedStep?: WalkthroughStep;
    markdownRenderer: MarkdownRenderer;
    onLinkClick?: (url: string) => void;
    onToggleStepDone?: (step: WalkthroughStep) => void;
    onMarkAllStepsDone?: () => void;
    themeService: ThemeService;
    logger: ILogger;
}

export function WalkthroughDetail(props: WalkthroughDetailProps): React.ReactElement {
    const { walkthrough, onStepSelect, onBack, selectedStep, markdownRenderer, themeService } = props;

    return (
        <div className='gs-walkthrough-detail'>
            <div className='gs-walkthrough-detail-header'>
                <a
                    role='button'
                    tabIndex={0}
                    className='gs-walkthrough-back-link'
                    onClick={onBack}
                    onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === 'Enter') {
                            onBack();
                        }
                    }}
                >
                    <i className={codicon('arrow-left')}></i>
                    <span className='gs-walkthrough-back-label'>{nls.localizeByDefault('Back')}</span>
                </a>
                <h2 className='gs-walkthrough-detail-title'>
                    <WalkthroughIcon walkthrough={walkthrough} />
                    {walkthrough.title}
                </h2>
                <p className='gs-walkthrough-detail-description'>{walkthrough.description}</p>
            </div>
            <div className='gs-walkthrough-detail-body'>
                <div className='gs-walkthrough-steps'>
                    {walkthrough.steps.map(step => (
                        <WalkthroughStepItem
                            key={step.id}
                            step={step}
                            isSelected={selectedStep?.id === step.id}
                            onSelect={onStepSelect}
                            onToggleDone={props.onToggleStepDone}
                        />
                    ))}
                    {props.onMarkAllStepsDone && (
                        <button
                            className='theia-button secondary gs-walkthrough-mark-all-done'
                            disabled={walkthrough.steps.every(step => step.isComplete)}
                            onClick={props.onMarkAllStepsDone}
                        >
                            {nls.localizeByDefault('Mark Done')}
                        </button>
                    )}
                </div>
                {selectedStep && (
                    <div className='gs-walkthrough-step-content'>
                        <WalkthroughStepContent
                            step={selectedStep}
                            markdownRenderer={markdownRenderer}
                            onLinkClick={props.onLinkClick}
                            themeService={themeService}
                            logger={props.logger}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

interface WalkthroughStepItemProps {
    step: WalkthroughStep;
    isSelected: boolean;
    onSelect: (step: WalkthroughStep) => void;
    onToggleDone?: (step: WalkthroughStep) => void;
}

function WalkthroughStepItem(props: WalkthroughStepItemProps): React.ReactElement {
    const { step, isSelected, onSelect, onToggleDone } = props;
    const iconClass = step.isComplete ? codicon('pass-filled') : codicon('circle-large-outline');
    const toggleDone = (event: React.SyntheticEvent) => {
        // Completing a step is a separate action from opening it.
        event.stopPropagation();
        onToggleDone?.(step);
    };

    return (
        <div
            className={`gs-walkthrough-step-item ${isSelected ? 'selected' : ''} ${step.isComplete ? 'completed' : ''}`}
            role='button'
            tabIndex={0}
            onClick={() => onSelect(step)}
            onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter') {
                    onSelect(step);
                }
            }}
        >
            <span
                className={`gs-walkthrough-step-icon ${iconClass}`}
                role={onToggleDone ? 'checkbox' : undefined}
                aria-checked={onToggleDone ? step.isComplete : undefined}
                tabIndex={onToggleDone ? 0 : undefined}
                title={onToggleDone
                    ? (step.isComplete
                        ? nls.localize('theia/getting-started/markStepUndone', 'Mark Undone')
                        : nls.localizeByDefault('Mark Done'))
                    : undefined}
                onClick={onToggleDone && toggleDone}
                onKeyDown={onToggleDone && ((e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        toggleDone(e);
                    }
                })}
            ></span>
            <span className='gs-walkthrough-step-title'>{step.title}</span>
        </div>
    );
}

interface WalkthroughStepContentProps {
    step: WalkthroughStep;
    markdownRenderer: MarkdownRenderer;
    onLinkClick?: (url: string) => void;
    themeService: ThemeService;
    logger: ILogger;
}

function WalkthroughStepContent(props: WalkthroughStepContentProps): React.ReactElement {
    const { step, markdownRenderer, themeService } = props;

    return (
        <div className='gs-walkthrough-step-detail'>
            <h3>{step.title}</h3>
            <WalkthroughDescriptionContent
                description={step.description}
                markdownRenderer={markdownRenderer}
                onLinkClick={props.onLinkClick}
            />
            {step.media && renderMedia(step.media, markdownRenderer, themeService, props.logger, props.onLinkClick)}
        </div>
    );
}

interface WalkthroughDescriptionContentProps {
    description: string;
    markdownRenderer: MarkdownRenderer;
    onLinkClick?: (url: string) => void;
}

function WalkthroughDescriptionContent(props: WalkthroughDescriptionContentProps): React.ReactElement {
    // eslint-disable-next-line no-null/no-null
    const containerRef = React.useRef<HTMLDivElement>(null);
    const renderResultRef = React.useRef<MarkdownRenderResult | undefined>(undefined);
    const disposablesRef = React.useRef<DisposableCollection | undefined>(undefined);
    const onLinkClickRef = React.useRef(props.onLinkClick);
    onLinkClickRef.current = props.onLinkClick;

    React.useEffect(() => {
        if (!containerRef.current) { return; }
        renderResultRef.current?.dispose();
        disposablesRef.current?.dispose();

        const options = createMarkdownOptions(onLinkClickRef, disposablesRef);
        const result = props.markdownRenderer.render(toTrustedMarkdown(toMarkdownWithLineBreaks(props.description)), options);
        renderResultRef.current = result;
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(result.element);

        return () => {
            renderResultRef.current?.dispose();
            disposablesRef.current?.dispose();
        };
    }, [props.description, props.markdownRenderer]);

    return <div className='gs-walkthrough-step-description' ref={containerRef} />;
}

/**
 * Walkthrough content is rendered as trusted Markdown so that the `command:` links it relies on survive
 * rendering. It comes from an installed plugin, which can execute commands through its own API anyway.
 */
function toTrustedMarkdown(value: string): MarkdownString {
    return { value, isTrusted: true };
}

/**
 * Routes link activation to `onLinkClick`. Without an action handler the Monaco based renderer clears every
 * `href` and installs no click handling, which leaves the links of the rendered content inert.
 */
function createMarkdownOptions(
    onLinkClickRef: React.MutableRefObject<((url: string) => void) | undefined>,
    disposablesRef: React.MutableRefObject<DisposableCollection | undefined>
): MarkdownRenderOptions | undefined {
    if (!onLinkClickRef.current) {
        return undefined;
    }
    const disposables = new DisposableCollection();
    disposablesRef.current = disposables;
    return {
        actionHandler: {
            callback: (content: string) => onLinkClickRef.current?.(content),
            disposables
        }
    };
}

/**
 * Turn the single newlines that walkthrough step descriptions use for line breaks into Markdown hard breaks.
 *
 * VS Code renders every line of a step description as its own block, while Markdown collapses single
 * newlines into spaces. Blank lines are left alone so that explicit paragraphs still work.
 */
function toMarkdownWithLineBreaks(description: string): string {
    return description.replace(/(?<!\n)\n(?!\n)/g, '  \n');
}

function renderMedia(
    media: WalkthroughStep['media'],
    markdownRenderer: MarkdownRenderer,
    themeService: ThemeService,
    logger: ILogger,
    onLinkClick?: (url: string) => void
): React.ReactNode {
    if (!media) {
        return undefined;
    }
    if ('markdown' in media) {
        return <WalkthroughMedia src={media.markdown} markdownRenderer={markdownRenderer} logger={logger} onLinkClick={onLinkClick} />;
    }
    if ('svg' in media) {
        return <WalkthroughMediaSvg src={media.svg} altText={media.altText || undefined} logger={logger} onLinkClick={onLinkClick} />;
    }
    if ('image' in media) {
        return <WalkthroughMediaImage src={media.image} altText={media.altText || ''} themeService={themeService} />;
    }
    return undefined;
}

type WalkthroughMediaImageSource = string | { dark: string; light: string; hc: string; hcLight: string };

function pickThemeVariant(source: WalkthroughMediaImageSource, themeType: ThemeType): string {
    if (typeof source === 'string') {
        return source;
    }
    switch (themeType) {
        case 'light': return source.light;
        case 'hc': return source.hc;
        case 'hcLight': return source.hcLight;
        default: return source.dark;
    }
}

function WalkthroughMediaImage(props: { src: WalkthroughMediaImageSource, altText: string, themeService: ThemeService }): React.ReactElement | undefined {
    const { themeService } = props;
    const [themeType, setThemeType] = React.useState<ThemeType>(() => themeService.getCurrentTheme().type);
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => {
        const disposable = themeService.onDidColorThemeChange(event => setThemeType(event.newTheme.type));
        return () => disposable.dispose();
    }, [themeService]);

    const src = PluginSharedStyle.toExternalIconUrl(pickThemeVariant(props.src, themeType));
    React.useEffect(() => setFailed(false), [src]);

    if (failed) {
        // A missing image must not leave a broken image placeholder behind.
        return undefined;
    }
    return <img className='gs-walkthrough-media-image' src={src} alt={props.altText} onError={() => setFailed(true)} />;
}

function WalkthroughMedia(props: {
    src: string;
    markdownRenderer: MarkdownRenderer;
    logger: ILogger;
    onLinkClick?: (url: string) => void;
}): React.ReactElement {
    // eslint-disable-next-line no-null/no-null
    const containerRef = React.useRef<HTMLDivElement>(null);
    const renderResultRef = React.useRef<MarkdownRenderResult | undefined>(undefined);
    const disposablesRef = React.useRef<DisposableCollection | undefined>(undefined);
    const onLinkClickRef = React.useRef(props.onLinkClick);
    onLinkClickRef.current = props.onLinkClick;

    React.useEffect(() => {
        let cancelled = false;
        fetch(PluginSharedStyle.toExternalIconUrl(props.src))
            .then(response => !cancelled && response.ok ? response.text() : '')
            .then(text => {
                if (!cancelled && containerRef.current && text) {
                    renderResultRef.current?.dispose();
                    disposablesRef.current?.dispose();
                    const options = createMarkdownOptions(onLinkClickRef, disposablesRef);
                    const result = props.markdownRenderer.render(toTrustedMarkdown(text), options);
                    renderResultRef.current = result;
                    containerRef.current.innerHTML = '';
                    containerRef.current.appendChild(result.element);
                }
            })
            .catch(error => props.logger.warn(`Could not load the walkthrough media '${props.src}'.`, error));
        return () => {
            cancelled = true;
            renderResultRef.current?.dispose();
            renderResultRef.current = undefined;
            disposablesRef.current?.dispose();
        };
    }, [props.src, props.markdownRenderer]);

    return <div className='gs-walkthrough-media-markdown' ref={containerRef} />;
}

function WalkthroughMediaSvg(props: {
    src: string;
    altText?: string;
    logger: ILogger;
    onLinkClick?: (url: string) => void;
}): React.ReactElement | undefined {
    const [content, setContent] = React.useState<string | undefined>();
    // eslint-disable-next-line no-null/no-null
    const containerRef = React.useRef<HTMLDivElement>(null);
    const onLinkClickRef = React.useRef(props.onLinkClick);
    onLinkClickRef.current = props.onLinkClick;

    React.useEffect(() => {
        let cancelled = false;
        setContent(undefined);
        fetch(PluginSharedStyle.toExternalIconUrl(props.src))
            .then(response => (!cancelled && response.ok ? response.text() : ''))
            .then(text => {
                if (cancelled) {
                    return;
                }
                if (text) {
                    const sanitized = DOMPurify.sanitize(text, {
                        USE_PROFILES: { svg: true, svgFilters: true },
                        ADD_TAGS: ['use', 'a'],
                        ADD_ATTR: ['xlink:href', 'href', 'target'],
                        ALLOW_UNKNOWN_PROTOCOLS: true
                    });
                    setContent(sanitized || undefined);
                } else {
                    setContent(undefined);
                }
            })
            .catch(error => {
                if (!cancelled) {
                    setContent(undefined);
                    props.logger.warn(`Could not load the walkthrough media '${props.src}'.`, error);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [props.src, props.logger]);

    const handleClick = React.useCallback((event: React.MouseEvent) => {
        const target = event.target as Element | null;
        const anchor = target?.closest('a');
        if (!anchor || !containerRef.current?.contains(anchor)) {
            return;
        }
        const href = anchor.getAttribute('href') || anchor.getAttribute('xlink:href');
        if (href) {
            event.preventDefault();
            event.stopPropagation();
            onLinkClickRef.current?.(href);
        }
    }, []);

    if (!content) {
        return undefined;
    }

    return (
        <div
            className='gs-walkthrough-media-svg'
            ref={containerRef}
            role='img'
            aria-label={props.altText || undefined}
            onClick={handleClick}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: content }}
        />
    );
}

