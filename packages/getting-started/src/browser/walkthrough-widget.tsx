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

import { codicon } from '@theia/core/lib/browser';
import { MarkdownRenderer, MarkdownRenderOptions, MarkdownRenderResult } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import * as React from '@theia/core/shared/react';
import { Walkthrough, WalkthroughStep } from '../common/walkthrough-types';

export interface WalkthroughCardProps {
    walkthrough: Walkthrough;
    onSelect: (walkthrough: Walkthrough) => void;
}

export function WalkthroughCard(props: WalkthroughCardProps): React.ReactElement {
    const { walkthrough, onSelect } = props;
    const completedSteps = walkthrough.steps.filter(s => s.isComplete).length;
    const totalSteps = walkthrough.steps.length;

    return (
        <div
            className='gs-walkthrough-card'
            role='button'
            tabIndex={0}
            onClick={() => onSelect(walkthrough)}
            onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter') {
                    onSelect(walkthrough);
                }
            }}
        >
            <div className='gs-walkthrough-card-header'>
                {walkthrough.icon && <span className={`gs-walkthrough-icon ${codicon(walkthrough.icon)}`}></span>}
                <h3 className='gs-walkthrough-card-title'>{walkthrough.title}</h3>
            </div>
            <p className='gs-walkthrough-card-description'>{walkthrough.description}</p>
            <div className='gs-walkthrough-card-progress'>
                <div className='gs-walkthrough-progress-bar'>
                    <div
                        className='gs-walkthrough-progress-fill'
                        style={{ width: totalSteps > 0 ? `${(completedSteps / totalSteps) * 100}%` : '0%' }}
                    ></div>
                </div>
                <span className='gs-walkthrough-progress-text'>
                    {nls.localizeByDefault('{0} of {1}', String(completedSteps), String(totalSteps))}
                </span>
            </div>
        </div>
    );
}

export interface WalkthroughDetailProps {
    walkthrough: Walkthrough;
    onStepSelect: (step: WalkthroughStep) => void;
    onBack: () => void;
    selectedStep?: WalkthroughStep;
    markdownRenderer: MarkdownRenderer;
    onLinkClick?: (url: string) => void;
}

export function WalkthroughDetail(props: WalkthroughDetailProps): React.ReactElement {
    const { walkthrough, onStepSelect, onBack, selectedStep, markdownRenderer } = props;

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
                    {nls.localizeByDefault('Back')}
                </a>
                <h2 className='gs-walkthrough-detail-title'>{walkthrough.title}</h2>
                <p className='gs-walkthrough-detail-description'>{walkthrough.description}</p>
            </div>
            <div className='gs-walkthrough-steps'>
                {walkthrough.steps.map(step => (
                    <WalkthroughStepItem
                        key={step.id}
                        step={step}
                        isSelected={selectedStep?.id === step.id}
                        onSelect={onStepSelect}
                    />
                ))}
            </div>
            {selectedStep && (
                <div className='gs-walkthrough-step-content'>
                    <WalkthroughStepContent step={selectedStep} markdownRenderer={markdownRenderer} onLinkClick={props.onLinkClick} />
                </div>
            )}
        </div>
    );
}

interface WalkthroughStepItemProps {
    step: WalkthroughStep;
    isSelected: boolean;
    onSelect: (step: WalkthroughStep) => void;
}

function WalkthroughStepItem(props: WalkthroughStepItemProps): React.ReactElement {
    const { step, isSelected, onSelect } = props;
    const iconClass = step.isComplete ? codicon('pass-filled') : codicon('circle-large-outline');

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
            <span className={`gs-walkthrough-step-icon ${iconClass}`}></span>
            <span className='gs-walkthrough-step-title' style={{ color: 'var(--theia-walkthrough-stepTitle-foreground)' }}>
                {step.title}
            </span>
        </div>
    );
}

interface WalkthroughStepContentProps {
    step: WalkthroughStep;
    markdownRenderer: MarkdownRenderer;
    onLinkClick?: (url: string) => void;
}

function WalkthroughStepContent(props: WalkthroughStepContentProps): React.ReactElement {
    const { step, markdownRenderer } = props;

    return (
        <div className='gs-walkthrough-step-detail'>
            <h3>{step.title}</h3>
            <WalkthroughDescriptionContent
                description={step.description}
                markdownRenderer={markdownRenderer}
                onLinkClick={props.onLinkClick}
            />
            {step.media && renderMedia(step.media, markdownRenderer)}
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
    const renderResultRef = React.useRef<MarkdownRenderResult | undefined>();
    const onLinkClickRef = React.useRef(props.onLinkClick);
    onLinkClickRef.current = props.onLinkClick;

    React.useEffect(() => {
        if (!containerRef.current) { return; }
        renderResultRef.current?.dispose();

        const markdownString: MarkdownString = { value: props.description, isTrusted: true };
        const options: MarkdownRenderOptions | undefined = onLinkClickRef.current
            ? {
                actionHandler: {
                    callback: (content: string) => {
                        onLinkClickRef.current?.(content);
                    },
                    disposables: new DisposableCollection()
                }
            }
            : undefined;

        const result = props.markdownRenderer.render(markdownString, options);
        renderResultRef.current = result;
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(result.element);

        return () => { renderResultRef.current?.dispose(); };
    }, [props.description, props.markdownRenderer]);

    return <div className='gs-walkthrough-step-description' ref={containerRef} />;
}

function renderMedia(media: WalkthroughStep['media'], markdownRenderer: MarkdownRenderer): React.ReactNode {
    if (!media) {
        return undefined;
    }
    if ('markdown' in media) {
        return <WalkthroughMarkdownContent src={media.markdown} markdownRenderer={markdownRenderer} />;
    }
    if ('svg' in media) {
        return <img className='gs-walkthrough-media-image' src={media.svg} alt='' />;
    }
    if ('image' in media) {
        const src = typeof media.image === 'string' ? media.image : media.image.dark;
        const altText = media.altText || '';
        return <img className='gs-walkthrough-media-image' src={src} alt={altText} />;
    }
    return undefined;
}

function WalkthroughMarkdownContent(props: { src: string; markdownRenderer: MarkdownRenderer }): React.ReactElement {
    // eslint-disable-next-line no-null/no-null
    const containerRef = React.useRef<HTMLDivElement>(null);
    const renderResultRef = React.useRef<MarkdownRenderResult | undefined>();

    React.useEffect(() => {
        let cancelled = false;
        fetch(props.src)
            .then(response => !cancelled && response.ok ? response.text() : '')
            .then(text => {
                if (!cancelled && containerRef.current && text) {
                    renderResultRef.current?.dispose();
                    const result = props.markdownRenderer.render({ value: text });
                    renderResultRef.current = result;
                    containerRef.current.innerHTML = '';
                    containerRef.current.appendChild(result.element);
                }
            })
            .catch(() => { });
        return () => {
            cancelled = true;
            renderResultRef.current?.dispose();
            renderResultRef.current = undefined;
        };
    }, [props.src, props.markdownRenderer]);

    return <div className='gs-walkthrough-media-markdown' ref={containerRef} />;
}
