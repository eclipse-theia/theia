// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { UntitledResourceResolver } from '@theia/core';
import { OpenerService } from '@theia/core/lib/browser';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { isOSX } from '@theia/core/lib/common/os';
import { nls } from '@theia/core/lib/common/nls';
import { getThemeMode, ThemeMode } from '@theia/core/lib/common/theme';
import { generateUuid } from '@theia/core/lib/common/uuid';
import * as DOMPurify from '@theia/core/shared/dompurify';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';
import { IMouseEvent } from '@theia/monaco-editor-core';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import type { Mermaid } from 'mermaid';
import { CodeWrapper } from './code-part-renderer';
import { MarkdownRender } from './markdown-part-renderer';

/**
 * Mermaid pulls in a large dependency tree (d3, dagre, ...), so it is loaded lazily on first use.
 * The module-level promise ensures the library is imported and instantiated only once for the whole application.
 */
let mermaidLoader: Promise<Mermaid> | undefined;
const loadMermaid = (): Promise<Mermaid> => {
    if (!mermaidLoader) {
        mermaidLoader = import('mermaid').then(module => module.default);
    }
    return mermaidLoader;
};

/**
 * Mermaid keeps its configuration in a global singleton, so {@link Mermaid.initialize} must not run on every render.
 * We (re-)initialize it only when the workbench theme actually changes - tracked here across all diagram instances -
 * instead of on every streaming tick. This is cheaper and shrinks the window in which diagrams race on the shared config.
 */
let initializedTheme: ThemeMode | undefined;
const loadMermaidForTheme = async (themeMode: ThemeMode): Promise<Mermaid> => {
    const mermaid = await loadMermaid();
    if (initializedTheme !== themeMode) {
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: themeMode === 'dark' ? 'dark' : 'default'
        });
        initializedTheme = themeMode;
    }
    return mermaid;
};

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const SCALE_STEP = 0.2;

const clampScale = (scale: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(scale * 100) / 100));

/** Stops a click on the toolbar action buttons from bubbling to the title bar's collapse handler. */
const stopPropagation = (event: React.MouseEvent): void => event.stopPropagation();

/** Attributes whose URL value triggers an automatic resource fetch when the element is rendered. */
const RESOURCE_URL_ATTRIBUTES = new Set(['src', 'srcset', 'poster', 'background', 'lowsrc', 'dynsrc']);
/** `href`-style attributes, which only auto-load a resource on non-anchor elements (e.g. SVG `<image>`). */
const HREF_URL_ATTRIBUTES = new Set(['href', 'xlink:href']);

/**
 * Whether a URL would cause a network request. `data:` URIs (inlined, no network) and `#` fragment
 * references (internal SVG refs such as markers, gradients and clip paths) are considered safe.
 */
const triggersNetworkRequest = (value: string | undefined): boolean => {
    const normalized = (value ?? '').trim().toLowerCase();
    return normalized.length > 0 && !normalized.startsWith('data:') && !normalized.startsWith('#');
};

/**
 * Removes references to network resources from a CSS string, keeping internal `url(#...)` references and inline
 * `url(data:...)` resources. Neutralizes every construct that would fetch a remote resource on render: `url(...)`
 * functions, `@import` at-rules (both the `@import "..."` and `@import url(...)` forms) and the string form of
 * `image-set(...)` (its `url(...)` form is covered by the `url(...)` handling).
 */
const stripCssNetworkUrls = (css: string): string => css
    // `@import` pulls in a remote stylesheet; drop the whole at-rule (covers both `@import "..."` and `@import url(...)`).
    .replace(/@import\b[^;]*;?/gi, '')
    // `image-set(...)` can list resources as bare strings; blank out the network ones (its `url(...)` form is handled below).
    .replace(/image-set\(([^)]*)\)/gi, (_match: string, inner: string): string =>
        `image-set(${inner.replace(/(["'])(?!\s*(?:#|data:))[^"']*\1/g, '$1$1')})`)
    // `url(...)` resource references become an empty `url()`.
    .replace(/url\(\s*(['"]?)(?!#|data:)[^)'"]*\1\s*\)/gi, 'url()');

/**
 * Sanitizes the SVG produced by mermaid before it is injected via `dangerouslySetInnerHTML`.
 *
 * Mermaid renders node labels as HTML inside SVG `<foreignObject>`, which DOMPurify strips by default. We allow
 * `foreignObject` and mark it as an HTML integration point so the labels survive while still being sanitized.
 * DOMPurify removes scripts, event handlers and `javascript:` URLs, but not resource loading, so the hooks below
 * additionally strip any attribute or CSS reference (`url(...)`, `@import`, `image-set(...)`) that would fetch a
 * remote resource (an image-based exfiltration vector), while keeping inline `data:` resources, internal
 * `url(#...)` references and `<a>` links.
 * Mermaid additionally runs with `securityLevel: 'strict'`.
 */
export const sanitizeDiagram = (svg: string): string => {
    const onSanitizeAttribute = (node: Element, event: DOMPurify.UponSanitizeAttributeHookEvent): void => {
        if (event.attrName === 'style') {
            event.attrValue = stripCssNetworkUrls(event.attrValue);
            return;
        }
        const isHref = HREF_URL_ATTRIBUTES.has(event.attrName);
        if (!isHref && !RESOURCE_URL_ATTRIBUTES.has(event.attrName)) {
            return;
        }
        if (isHref && node.nodeName.toLowerCase() === 'a') {
            return;
        }
        if (triggersNetworkRequest(event.attrValue)) {
            event.keepAttr = false;
        }
    };
    const onSanitizeElement = (node: Element): void => {
        if (node.nodeName.toLowerCase() === 'style') {
            node.textContent = stripCssNetworkUrls(node.textContent ?? '');
        }
    };
    // Hooks are registered on the shared DOMPurify instance only for the duration of this synchronous
    // `sanitize` call (no other sanitization can interleave), and each is removed by reference afterwards.
    DOMPurify.addHook('uponSanitizeAttribute', onSanitizeAttribute);
    DOMPurify.addHook('uponSanitizeElement', onSanitizeElement);
    try {
        return DOMPurify.sanitize(svg, {
            USE_PROFILES: { svg: true, svgFilters: true, html: true },
            ADD_TAGS: ['foreignObject'],
            HTML_INTEGRATION_POINTS: { foreignobject: true }
        });
    } finally {
        DOMPurify.removeHook('uponSanitizeAttribute', onSanitizeAttribute);
        DOMPurify.removeHook('uponSanitizeElement', onSanitizeElement);
    }
};

export interface MermaidDiagramProps {
    /** The raw mermaid diagram definition. */
    code: string;
    /** Workbench theme mode the diagram is themed for. */
    themeMode: ThemeMode;
    /** Whether the surrounding content is complete. While incomplete, an unparseable diagram shows a "rendering" hint. */
    isComplete: boolean;
}

/**
 * Renders a mermaid diagram definition into a sanitized, themed SVG. While the definition cannot be parsed and the
 * content is still incomplete (e.g. streaming) it shows a "rendering" hint. Once complete, an unparseable definition
 * shows an error placeholder. The SVG is sanitized via {@link sanitizeDiagram}.
 *
 * The {@link MermaidViewer} keeps this component mounted across collapse and source toggles, so it renders the
 * (relatively expensive) diagram only when the definition or theme actually changes, not on every toggle.
 */
export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ code, themeMode, isComplete }) => {
    const [svg, setSvg] = React.useState<string | undefined>(undefined);
    const [error, setError] = React.useState<string | undefined>(undefined);

    React.useEffect(() => {
        let cancelled = false;
        const definition = code.trim();
        if (!definition) {
            setSvg(undefined);
            setError(undefined);
            return;
        }
        const id = `theia-mermaid-${generateUuid()}`;
        const renderDiagram = async () => {
            try {
                const mermaid = await loadMermaidForTheme(themeMode);
                // `parse` throws for invalid definitions, which is the common case while the response is still streaming.
                await mermaid.parse(definition);
                const { svg: rendered } = await mermaid.render(id, definition);
                if (!cancelled) {
                    // The SVG is sanitized before it is injected via `dangerouslySetInnerHTML` below.
                    setSvg(sanitizeDiagram(rendered));
                    setError(undefined);
                }
            } catch (reason) {
                if (!cancelled) {
                    setSvg(undefined);
                    setError(reason instanceof Error ? reason.message : String(reason));
                }
            } finally {
                // Mermaid may leave temporary measurement nodes behind, especially when rendering fails.
                document.getElementById(id)?.remove();
                document.getElementById(`d${id}`)?.remove();
            }
        };
        renderDiagram();
        return () => { cancelled = true; };
    }, [code, themeMode]);

    if (svg) {
        // eslint-disable-next-line react/no-danger
        return <div className='theia-MermaidViewer-diagram' dangerouslySetInnerHTML={{ __html: svg }} />;
    }
    // Only show the error once the content is complete and rendering actually failed. Before that (initial async
    // render, or a still-streaming definition that cannot parse yet) show the "rendering" hint, so a freshly shown
    // diagram does not briefly flash the error message before it appears.
    if (error && isComplete) {
        return (
            <div className='theia-MermaidViewer-error' title={error}>
                <span className='codicon codicon-warning'></span>
                <span>{nls.localize('theia/ai/chat-ui/mermaid-rendering/error',
                    'Unable to render the Mermaid diagram. Switch to the source view to inspect the definition.')}</span>
            </div>
        );
    }
    return <div className='theia-MermaidViewer-status'>
        {nls.localize('theia/ai/chat-ui/mermaid-rendering/rendering', 'Rendering diagram…')}
    </div>;
};

/** Tracks the workbench theme mode (light/dark), re-rendering the consumer when the color theme changes. */
export const useThemeMode = (themeService: ThemeService): ThemeMode => {
    const [mode, setMode] = React.useState<ThemeMode>(() => getThemeMode(themeService.getCurrentTheme().type));
    React.useEffect(() => {
        const disposable = themeService.onDidColorThemeChange(event => setMode(getThemeMode(event.newTheme.type)));
        return () => disposable.dispose();
    }, [themeService]);
    return mode;
};

export interface MarkdownMermaidSegment {
    type: 'markdown' | 'mermaid';
    content: string;
}

/**
 * Splits markdown text into ```mermaid fenced-code blocks and the (markdown) text around them.
 * Only mermaid fences are separated out. Every other construct - including non-mermaid code fences -
 * stays within the surrounding markdown segments so it keeps rendering as before.
 */
export const splitMermaidSegments = (text: string): MarkdownMermaidSegment[] => {
    const segments: MarkdownMermaidSegment[] = [];
    const fence = /^[ \t]*```[ \t]*mermaid[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*$/gim;
    let lastIndex = 0;
    let match: RegExpExecArray | undefined;
    while ((match = fence.exec(text) ?? undefined) !== undefined) {
        if (match.index > lastIndex) {
            segments.push({ type: 'markdown', content: text.slice(lastIndex, match.index) });
        }
        segments.push({ type: 'mermaid', content: match[1] });
        lastIndex = fence.lastIndex;
    }
    if (lastIndex < text.length) {
        segments.push({ type: 'markdown', content: text.slice(lastIndex) });
    }
    return segments;
};

/** A small icon button (codicon) used in the diagram toolbar. */
const ToolbarButton: React.FC<{ icon: string; title: string; onClick: () => void }> = ({ icon, title, onClick }) =>
    <div className={`action-label codicon codicon-${icon}`} title={title} role='button' onClick={onClick}></div>;

interface MermaidViewportProps {
    scale: number;
    offset: { x: number; y: number };
    onOffsetChange: (offset: { x: number; y: number }) => void;
    onScaleChange: (updater: (prev: number) => number) => void;
    /** When collapsed, the viewport shrinks to a thumbnail that fits the whole diagram and a click expands it. */
    collapsed: boolean;
    /** Hide the viewport without unmounting it (e.g. while the source view is shown), so the diagram is not re-rendered. */
    hidden: boolean;
    onExpand: () => void;
    children: ReactNode;
}

/**
 * Hosts the rendered diagram. Expanded, it provides drag-to-pan and (Ctrl/Cmd +) wheel-to-zoom and is resizable via
 * CSS; collapsed, it shrinks to a thumbnail and a click expands it. It always keeps its children mounted - collapse,
 * source and visibility are expressed via styling only - so the diagram is never re-rendered when toggling.
 */
const MermaidViewport: React.FC<MermaidViewportProps> = ({ scale, offset, onOffsetChange, onScaleChange, collapsed, hidden, onExpand, children }) => {
    // eslint-disable-next-line no-null/no-null
    const viewportRef = React.useRef<HTMLDivElement>(null);
    const dragRef = React.useRef<{ startX: number; startY: number; originX: number; originY: number } | undefined>(undefined);

    const onPointerDown = React.useCallback((event: React.PointerEvent) => {
        if (collapsed || event.button !== 0) {
            return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y };
    }, [collapsed, offset.x, offset.y]);

    const onPointerMove = React.useCallback((event: React.PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) {
            return;
        }
        onOffsetChange({ x: drag.originX + (event.clientX - drag.startX), y: drag.originY + (event.clientY - drag.startY) });
    }, [onOffsetChange]);

    const onPointerUp = React.useCallback((event: React.PointerEvent) => {
        dragRef.current = undefined;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
    }, []);

    // Attach the wheel listener natively so we can call preventDefault (React's synthetic wheel listener is passive).
    React.useEffect(() => {
        const element = viewportRef.current;
        if (!element || collapsed) {
            return;
        }
        const onWheel = (event: WheelEvent) => {
            // Only zoom while a modifier is held, so a plain wheel still scrolls the surrounding chat.
            if (!event.ctrlKey && !event.metaKey) {
                return;
            }
            event.preventDefault();
            onScaleChange(prev => clampScale(prev + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP)));
        };
        element.addEventListener('wheel', onWheel, { passive: false });
        return () => element.removeEventListener('wheel', onWheel);
    }, [collapsed, onScaleChange]);

    return (
        <div
            ref={viewportRef}
            className={`theia-MermaidViewer-viewport${collapsed ? ' collapsed' : ''}`}
            hidden={hidden}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onClick={collapsed ? onExpand : undefined}
        >
            {/* The transform only applies when expanded; collapsed fits the whole diagram via CSS. */}
            <div className='theia-MermaidViewer-canvas' style={collapsed ? undefined : { transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
                {children}
            </div>
        </div>
    );
};

export interface MermaidViewerProps {
    /** The raw mermaid diagram definition. */
    code: string;
    /** Whether the surrounding content is complete. While incomplete, an unparseable diagram shows a "rendering" hint. */
    isComplete: boolean;
    themeService: ThemeService;
    clipboardService: ClipboardService;
    editorProvider: MonacoEditorProvider;
    untitledResourceResolver: UntitledResourceResolver;
    /** Optional context menu handler for the source view's editor. */
    contextMenuCallback?: (event: IMouseEvent) => void;
}

/**
 * A self-contained, reusable mermaid viewer: a toolbar (collapse, diagram/source toggle, zoom, copy), a pan/zoom
 * viewport with the diagram, and the {@link CodeWrapper} editor as the source view. It is not tied to the chat and
 * can be embedded anywhere a mermaid diagram should be shown.
 */
export const MermaidViewer: React.FC<MermaidViewerProps> = ({
    code, isComplete, themeService, clipboardService, editorProvider, untitledResourceResolver, contextMenuCallback
}) => {
    const [mode, setMode] = React.useState<'diagram' | 'source'>('diagram');
    const [collapsed, setCollapsed] = React.useState(false);
    const [scale, setScale] = React.useState(1);
    const [offset, setOffset] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const themeMode = useThemeMode(themeService);

    const toggleMode = () => setMode(prev => (prev === 'diagram' ? 'source' : 'diagram'));
    const toggleCollapsed = () => setCollapsed(prev => !prev);
    const expand = () => setCollapsed(false);
    const zoomIn = () => setScale(prev => clampScale(prev + SCALE_STEP));
    const zoomOut = () => setScale(prev => clampScale(prev - SCALE_STEP));
    const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }); };
    const copySource = () => clipboardService.writeText(code);

    const isDiagram = mode === 'diagram';
    const diagram = <MermaidDiagram code={code} themeMode={themeMode} isComplete={isComplete} />;
    const wheelZoomHint = nls.localize('theia/ai/chat-ui/mermaid-rendering/wheelZoomHint', '{0} + Scroll', isOSX ? 'Cmd' : 'Ctrl');
    return (
        <div className='theia-MermaidViewer-root'>
            <div
                className='theia-MermaidViewer-toolbar'
                role='button'
                title={collapsed ? nls.localizeByDefault('Expand') : nls.localizeByDefault('Collapse')}
                onClick={toggleCollapsed}>
                <span className='theia-MermaidViewer-title'>
                    {nls.localize('theia/ai/chat-ui/mermaid-rendering/title', 'Mermaid Diagram')}
                </span>
                <div className='theia-MermaidViewer-actions' onClick={stopPropagation}>
                    {!collapsed && isDiagram && <>
                        <ToolbarButton icon='zoom-in' title={`${nls.localizeByDefault('Zoom In')} (${wheelZoomHint})`} onClick={zoomIn} />
                        <ToolbarButton icon='zoom-out' title={`${nls.localizeByDefault('Zoom Out')} (${wheelZoomHint})`} onClick={zoomOut} />
                        <ToolbarButton
                            icon='screen-normal'
                            title={nls.localize('theia/ai/chat-ui/mermaid-rendering/resetView', 'Reset View')}
                            onClick={resetView} />
                    </>}
                    <ToolbarButton icon='copy' title={nls.localize('theia/ai/chat-ui/mermaid-rendering/copySource', 'Copy Source')} onClick={copySource} />
                    {!collapsed && <ToolbarButton
                        icon={isDiagram ? 'code' : 'graph'}
                        title={isDiagram
                            ? nls.localize('theia/ai/chat-ui/mermaid-rendering/showSource', 'Show Source')
                            : nls.localize('theia/ai/chat-ui/mermaid-rendering/showDiagram', 'Show Diagram')}
                        onClick={toggleMode} />}
                    <ToolbarButton
                        icon={collapsed ? 'chevron-down' : 'chevron-up'}
                        title={collapsed ? nls.localizeByDefault('Expand') : nls.localizeByDefault('Collapse')}
                        onClick={toggleCollapsed} />
                </div>
            </div>
            {/* The viewport (and the diagram inside it) stays mounted across collapse and source toggles - it is
                only restyled or hidden - so the diagram is never re-rendered. The source editor is a sibling shown
                only in the expanded source view. */}
            <MermaidViewport
                scale={scale}
                offset={offset}
                onOffsetChange={setOffset}
                onScaleChange={setScale}
                collapsed={collapsed}
                hidden={!collapsed && !isDiagram}
                onExpand={expand}>
                {diagram}
            </MermaidViewport>
            {!collapsed && !isDiagram &&
                <div className='theia-MermaidViewer-source'>
                    <CodeWrapper
                        content={code}
                        editorProvider={editorProvider}
                        untitledResourceResolver={untitledResourceResolver}
                        contextMenuCallback={contextMenuCallback ?? (() => { })} />
                </div>}
        </div>
    );
};

export interface MarkdownWithMermaidProps {
    content: string;
    openerService: OpenerService;
    themeService: ThemeService;
    clipboardService: ClipboardService;
    editorProvider: MonacoEditorProvider;
    untitledResourceResolver: UntitledResourceResolver;
}

/**
 * Renders markdown that may contain ```mermaid fenced blocks, drawing those blocks as diagrams.
 *
 * The main chat response splits mermaid blocks into their own content parts (via `parseContents`) which the
 * `MermaidPartRenderer` then handles. Other surfaces - such as the user interaction tool - instead render a raw
 * markdown string directly (via `useMarkdownRendering`) and never pass through that pipeline, so a mermaid block
 * would show as plain code. This component bridges the gap by rendering mermaid blocks with the exact same
 * {@link MermaidViewer} component used in the chat (so the diagram looks and behaves identically everywhere), while
 * leaving all other content to normal markdown rendering.
 */
export const MarkdownWithMermaid: React.FC<MarkdownWithMermaidProps> = ({
    content, openerService, themeService, clipboardService, editorProvider, untitledResourceResolver
}) => {
    const segments = React.useMemo(
        () => splitMermaidSegments(content).filter(segment => segment.type === 'mermaid' || segment.content.trim().length > 0),
        [content]
    );
    return <>
        {segments.map((segment, index) => segment.type === 'mermaid'
            ? <MermaidViewer
                key={index}
                code={segment.content}
                isComplete={true}
                themeService={themeService}
                clipboardService={clipboardService}
                editorProvider={editorProvider}
                untitledResourceResolver={untitledResourceResolver} />
            : <MarkdownRender key={index} text={segment.content} openerService={openerService} />
        )}
    </>;
};
