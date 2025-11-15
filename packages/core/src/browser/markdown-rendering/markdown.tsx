// *****************************************************************************
// Copyright (C) 2025 EclipseSource and others.
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
import { MarkdownRenderer, MarkdownRenderResult } from './markdown-renderer';
import { MarkdownString, MarkdownStringImpl } from '../../common/markdown-rendering/markdown-string';
import { nls } from '../../common/nls';
import { FormatType } from '../../common/i18n/localization';

export interface MarkdownProps {
    /**
     * The markdown content to render. Can be a string, a MarkdownString, or undefined.
     * If undefined or empty, an empty div will be rendered.
     */
    markdown?: string | MarkdownString;

    /**
     * The MarkdownRenderer instance to use for rendering.
     */
    markdownRenderer: MarkdownRenderer;

    /**
     * Additional CSS class name(s) to apply to the container element.
     */
    className?: string;

    /**
     * Options to pass to MarkdownStringImpl if markdown is a string.
     * Common options include:
     * - supportHtml: Allow HTML in markdown (default: false)
     * - supportThemeIcons: Allow theme icons (default: false)
     * - isTrusted: Trust level for command execution (default: false)
     */
    markdownOptions?: {
        supportHtml?: boolean;
        supportThemeIcons?: boolean;
        isTrusted?: boolean | { enabledCommands: string[] };
    };

    /**
     * Optional callback that receives the rendered HTML element.
     * Useful for post-processing or adding event listeners.
     * Receives undefined when content is empty.
     */
    onRender?: (element: HTMLElement | undefined) => void;
}

/**
 * A React component for rendering markdown content.
 *
 * @example Basic usage
 * ```tsx
 * const MyComponent = ({ markdownRenderer }: { markdownRenderer: MarkdownRenderer }) => {
 *   return (
 *     <Markdown
 *       markdown="Hello **World**!"
 *       markdownRenderer={markdownRenderer}
 *       className="my-content"
 *       markdownOptions={{ supportHtml: true }}
 *     />
 *   );
 * };
 * ```
 *
 * @example With localized content
 * ```tsx
 * const MyComponent = ({ markdownRenderer }: { markdownRenderer: MarkdownRenderer }) => {
 *   const content = nls.localize('my.key', 'Hello **{0}**!', 'World');
 *
 *   return (
 *     <Markdown
 *       markdown={content}
 *       markdownRenderer={markdownRenderer}
 *       className="my-content"
 *     />
 *   );
 * };
 * ```
 *
 * @example With command links
 * ```tsx
 * const content = nls.localize(
 *   'my.key',
 *   'Open [settings]({0}) to configure.',
 *   `command:${CommonCommands.OPEN_PREFERENCES.id}`
 * );
 *
 * return (
 *   <Markdown
 *     markdown={content}
 *     markdownRenderer={markdownRenderer}
 *     markdownOptions={{
 *       isTrusted: { enabledCommands: [CommonCommands.OPEN_PREFERENCES.id] }
 *     }}
 *   />
 * );
 * ```
 */
const MarkdownComponent: React.FC<MarkdownProps> = ({
    markdown,
    markdownRenderer,
    className,
    markdownOptions,
    onRender
}) => {
    const ref = useMarkdown(markdown, markdownRenderer, markdownOptions, onRender);
    return <div className={className} ref={ref} />;
};
MarkdownComponent.displayName = 'Markdown';

export const Markdown = React.memo(MarkdownComponent);

/**
 * A React hook for rendering markdown content.
 *
 * This hook integrates MarkdownRenderer with React's lifecycle,
 * ensuring that:
 * - Markdown is rendered only when content or renderer changes
 * - MarkdownRenderResult is properly disposed when component unmounts
 * - DOM elements are correctly managed by React
 * - Event listeners and other imperative DOM operations are preserved
 *
 * Returns a ref that should be attached to a DOM element.
 *
 * @example Basic usage
 * ```tsx
 * const MyComponent = ({ markdownRenderer }: { markdownRenderer: MarkdownRenderer }) => {
 *   const ref = useMarkdown('Hello **World**!', markdownRenderer, { supportHtml: true });
 *   return <div className="my-content" ref={ref} />;
 * };
 * ```
 *
 * @example With localized content
 * ```tsx
 * const MyComponent = ({ markdownRenderer }: { markdownRenderer: MarkdownRenderer }) => {
 *   const content = nls.localize('my.key', 'Hello **{0}**!', 'World');
 *   const ref = useMarkdown(content, markdownRenderer);
 *   return <div className="my-content" ref={ref} />;
 * };
 * ```
 */
export function useMarkdown(
    markdown: string | MarkdownString | undefined,
    markdownRenderer: MarkdownRenderer,
    markdownOptions?: MarkdownProps['markdownOptions'],
    onRender?: (element: HTMLElement | undefined) => void
): React.RefObject<HTMLDivElement> {
    // eslint-disable-next-line no-null/no-null
    const containerRef = React.useRef<HTMLDivElement>(null);
    const renderResultRef = React.useRef<MarkdownRenderResult | undefined>();

    const renderedElement = React.useMemo(() => {
        renderResultRef.current?.dispose();
        renderResultRef.current = undefined;

        if (!markdown || (typeof markdown === 'string' && markdown.trim() === '')) {
            return undefined;
        }

        const markdownString = typeof markdown === 'string'
            ? new MarkdownStringImpl(markdown, markdownOptions)
            : markdown;

        const rendered = markdownRenderer.render(markdownString);
        renderResultRef.current = rendered;

        return rendered.element;
    }, [markdown, markdownRenderer, markdownOptions]);

    React.useEffect(() => {
        if (containerRef.current && renderedElement) {
            containerRef.current.replaceChildren(renderedElement);
            onRender?.(renderedElement);
        } else if (containerRef.current && !renderedElement) {
            containerRef.current.replaceChildren();
            onRender?.(undefined);
        }
    }, [renderedElement, onRender]);

    React.useEffect(() => () => {
        renderResultRef.current?.dispose();
    }, []);

    return containerRef;
}

export interface LocalizedMarkdownProps extends MarkdownProps {
    /**
     * The localization key for the markdown content.
     */
    localizationKey: string;

    /**
     * The default markdown content (in English) with placeholders.
     * Use {0}, {1}, etc. for parameter substitution.
     */
    defaultMarkdown: string;

    /**
     * Arguments to substitute into the markdown template.
     * Can be strings, numbers, booleans, or undefined.
     */
    args?: FormatType[];
}

/**
 * A React component that combines localization with markdown rendering.
 *
 * This component automatically handles the localization of markdown content using `nls.localize`
 * and then renders it using the Markdown component.
 *
 * @example Basic usage
 * ```tsx
 * <LocalizedMarkdown
 *   localizationKey="theia/mypackage/welcome"
 *   defaultMarkdown="Welcome to **Theia**!"
 *   markdownRenderer={this.markdownRenderer}
 *   className="welcome-message"
 * />
 * ```
 *
 * @example With parameters
 * ```tsx
 * <LocalizedMarkdown
 *   localizationKey="theia/mypackage/greeting"
 *   defaultMarkdown="Hello **{0}**! You have {1} new messages."
 *   args={['Alice', 5]}
 *   markdownRenderer={this.markdownRenderer}
 * />
 * ```
 *
 * @example With command links
 * ```tsx
 * <LocalizedMarkdown
 *   localizationKey="theia/mypackage/settings"
 *   defaultMarkdown="Open [settings]({0}) to configure."
 *   args={[`command:${CommonCommands.OPEN_PREFERENCES.id}`]}
 *   markdownRenderer={this.markdownRenderer}
 *   markdownOptions={{
 *     isTrusted: { enabledCommands: [CommonCommands.OPEN_PREFERENCES.id] }
 *   }}
 * />
 * ```
 */
export const LocalizedMarkdown: React.FC<LocalizedMarkdownProps> = ({
    localizationKey,
    defaultMarkdown,
    args = [],
    markdownRenderer,
    className,
    markdownOptions,
    onRender
}) => {
    const localizedMarkdown = React.useMemo(
        () => nls.localize(localizationKey, defaultMarkdown, ...args),
        [localizationKey, defaultMarkdown, ...args]
    );

    return (
        <Markdown
            markdown={localizedMarkdown}
            markdownRenderer={markdownRenderer}
            className={className}
            markdownOptions={markdownOptions}
            onRender={onRender}
        />
    );
};
LocalizedMarkdown.displayName = 'LocalizedMarkdown';
