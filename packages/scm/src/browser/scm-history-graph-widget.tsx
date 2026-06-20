// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import * as React from '@theia/core/shared/react';
import { Virtuoso } from '@theia/core/shared/react-virtuoso';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { HoverService } from '@theia/core/lib/browser/hover-service';
import { MarkdownRenderer, MarkdownRendererFactory } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { ScmHistoryGraphModel, HistoryGraphEntry } from './scm-history-graph-model';
import { ScmHistoryItemRef, ScmHistoryItemChange } from './scm-provider';
import { ScmService } from './scm-service';
import { GraphRow } from './scm-history-graph-lanes';
import URI from '@theia/core/lib/common/uri';
import { nls } from '@theia/core/lib/common/nls';
import { CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { MenuPath } from '@theia/core/lib/common/menu/menu-types';
import { ContextMenuRenderer } from '@theia/core/lib/browser/context-menu-renderer';
import { OpenerService, open } from '@theia/core/lib/browser/opener-service';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { ScmContextKeyService } from './scm-context-key-service';
import {
    laneColor, getChangeStatus, getFileName, getFilePath, getRepoRelativePath,
    getRefBadgeClass, isTagRef, isRemoteRef, deduplicateRefs, DeduplicatedRef
} from './scm-history-graph-helpers';
import { buildHtmlTooltip } from './scm-history-graph-tooltip';

/** Menu path matching the VS Code 'scm/history/title' contribution point (graph section toolbar). */
export const SCM_HISTORY_TITLE_MENU: MenuPath = ['plugin_scm/history/title'];
/** Menu path matching the VS Code 'scm/historyItem/context' contribution point (commit row context menu). */
export const SCM_HISTORY_ITEM_CONTEXT_MENU: MenuPath = ['plugin_scm/historyItem/context'];
/** Menu path matching the VS Code 'scm/historyItemRef/context' contribution point (ref badge context menu). */
export const SCM_HISTORY_ITEM_REF_CONTEXT_MENU: MenuPath = ['plugin_scm/historyItemRef/context'];

// ── Layout constants ────────────────────────────────────────────────────────

const ROW_HEIGHT = 22;
/** Horizontal width of each lane column in the SVG — matches VS Code exactly. */
const LANE_WIDTH = 22;
/** Y position of the commit dot — vertically centered in the row. */
const DOT_CY = 11;

/** Renders a ref badge as a JSX element for the commit row. */
function renderJsxRefBadge(
    ref: ScmHistoryItemRef,
    iconClass: string,
    showText: boolean,
    style: React.CSSProperties,
    key: string,
    onContextMenu?: (e: React.MouseEvent) => void
): React.ReactElement {
    return (
        <span
            key={key}
            className={`scm-history-ref-badge ${getRefBadgeClass(ref)}`}
            title={ref.description ?? ref.name}
            style={style}
            onContextMenu={onContextMenu}
        >
            <i className={`codicon ${iconClass} scm-history-ref-icon`} />
            {showText && <span className='scm-history-ref-text'>{ref.name}</span>}
        </span>
    );
}

// ── Widget ──────────────────────────────────────────────────────────────────

@injectable()
export class ScmHistoryGraphWidget extends ReactWidget {

    static readonly ID = 'scm-history-graph-widget';
    static readonly LABEL = nls.localizeByDefault('Graph');

    @inject(ScmHistoryGraphModel) protected readonly model: ScmHistoryGraphModel;
    @inject(HoverService) protected readonly hoverService: HoverService;
    @inject(MarkdownRendererFactory) protected readonly markdownRendererFactory: MarkdownRendererFactory;
    @inject(ScmService) protected readonly scmService: ScmService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;
    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(ScmContextKeyService) protected readonly scmContextKeys: ScmContextKeyService;

    protected selectedIndex = -1;
    /** Currently selected change row key (`${itemId}-${ci}`), or undefined. */
    protected selectedChangeKey: string | undefined;
    /** Map from commit id → loaded changes (undefined = not loaded yet). */
    protected expandedChanges = new Map<string, ScmHistoryItemChange[] | 'loading'>();
    /** Set of commit ids that are currently expanded. */
    protected expandedIds = new Set<string>();
    /** Map from commit id → in-flight CancellationTokenSource for loadChanges. */
    protected loadChangesCts = new Map<string, CancellationTokenSource>();

    constructor() {
        super();
        this.id = ScmHistoryGraphWidget.ID;
        this.title.label = ScmHistoryGraphWidget.LABEL;
        this.title.caption = ScmHistoryGraphWidget.LABEL;
        this.title.closable = false;
        this.addClass('scm-history-graph-container');
        this.node.tabIndex = 0;
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(
            this.model.onDidChange(() => {
                this.updateContextKeys();
                this.update();
            })
        );
        this.toDispose.push({
            dispose: () => {
                for (const cts of this.loadChangesCts.values()) {
                    cts.cancel();
                    cts.dispose();
                }
                this.loadChangesCts.clear();
            }
        });
        this.update();
    }

    protected updateContextKeys(): void {
        const provider = this.model.provider;
        this.scmContextKeys.scmCurrentHistoryItemRefHasRemote.set(!!provider?.currentHistoryItemRemoteRef);
        this.scmContextKeys.scmCurrentHistoryItemRefHasBase.set(!!provider?.currentHistoryItemBaseRef);
    }

    protected render(): React.ReactNode {
        const { entries, hasMore, loading } = this.model;

        // Only show the empty state once the model has completed at least one load attempt.
        // While the model is still initializing (provider not yet set, no load attempted),
        // render a loading indicator to avoid a flash of "no history" on startup.
        if (!loading && entries.length === 0) {
            if (!this.model.hasAttemptedLoad) {
                return (
                    <div className='scm-history-loading'>
                        {nls.localizeByDefault('Loading')}
                    </div>
                );
            }
            return (
                <div className='scm-history-empty'>
                    {nls.localize('theia/scm/noHistory', 'No source control history available.')}
                </div>
            );
        }

        // Determine how many lanes are active for SVG width
        const maxLane = entries.reduce((max, e) => {
            const rowMax = Math.max(e.graphRow.lane, ...e.graphRow.edges.map(ed => Math.max(ed.fromLane, ed.toLane)));
            return Math.max(max, rowMax);
        }, 0);
        const svgWidth = (maxLane + 1) * LANE_WIDTH;

        const footer = loading
            ? () => <div className='scm-history-loading'>{nls.localizeByDefault('Loading')}</div>
            : hasMore
                ? () => (
                    <div
                        className='scm-history-load-more'
                        onClick={this.handleLoadMore}
                        role='button'
                        tabIndex={0}
                        onKeyDown={this.handleLoadMoreKey}
                    >
                        {nls.localizeByDefault('Load more')}
                    </div>
                )
                : undefined;

        return (
            <Virtuoso
                className='scm-history-graph-list'
                data={entries as HistoryGraphEntry[]}
                itemContent={(idx, entry) => this.renderRow(entry, idx, svgWidth)}
                endReached={hasMore && !loading ? this.handleEndReached : undefined}
                overscan={500}
                components={footer ? { Footer: footer } : {}}
                style={{ overflowX: 'hidden' }}
            />
        );
    }

    protected handleEndReached = (): void => {
        if (this.model.hasMore && !this.model.loading) {
            this.model.loadMore();
        }
    };

    protected renderRow(entry: HistoryGraphEntry, idx: number, svgWidth: number): React.ReactElement {
        const { item, graphRow } = entry;
        const isSelected = idx === this.selectedIndex;
        const isExpanded = this.expandedIds.has(item.id);
        const changes = this.expandedChanges.get(item.id);
        // The first commit (idx === 0) on lane 0 is treated as HEAD/current
        const isHead = idx === 0 && graphRow.lane === 0;

        return (
            <React.Fragment key={item.id}>
                <div
                    className={`scm-history-graph-row${isSelected ? ' selected' : ''}`}
                    onClick={() => this.handleRowClick(idx, entry)}
                    onContextMenu={e => this.handleRowContextMenu(e, entry)}
                    onMouseEnter={e => this.handleRowMouseEnter(e, entry)}
                >
                    {this.renderGraphSvg(graphRow, svgWidth, isHead)}
                    <div className='scm-history-graph-info'>
                        <span className='scm-history-subject'>{item.subject}</span>
                        {item.author && (
                            <span className='scm-history-author'>{item.author}</span>
                        )}
                        {item.references && item.references.length > 0 && (
                            <span className='scm-history-badges scm-history-badges-right'>
                                {this.renderRefBadges(item.references, entry)}
                            </span>
                        )}
                    </div>
                </div>
                {isExpanded && this.renderChangesRows(item.id, svgWidth, graphRow, changes)}
            </React.Fragment>
        );
    }

    protected _markdownRenderer: MarkdownRenderer | undefined;
    protected get markdownRenderer(): MarkdownRenderer {
        this._markdownRenderer ||= this.markdownRendererFactory();
        return this._markdownRenderer;
    }

    protected handleRowMouseEnter = (e: React.MouseEvent<HTMLDivElement>, entry: HistoryGraphEntry): void => {
        this.hoverService.requestHover({
            content: buildHtmlTooltip(entry, this.markdownRenderer),
            target: e.currentTarget,
            position: 'right',
            interactive: true,
        });
    };

    protected renderChangesRows(
        itemId: string,
        svgWidth: number,
        graphRow: GraphRow,
        changes: ScmHistoryItemChange[] | 'loading' | undefined
    ): React.ReactElement {
        if (changes === 'loading' || changes === undefined) {
            return (
                <div key={`${itemId}-loading`} className='scm-history-changes-loading'>
                    {nls.localizeByDefault('Loading')}
                </div>
            );
        }

        if (changes.length === 0) {
            return (
                <div key={`${itemId}-empty`} className='scm-history-changes-empty'>
                    {nls.localize('theia/scm/noChanges', 'No changed files.')}
                </div>
            );
        }

        return (
            <React.Fragment key={`${itemId}-changes`}>
                {changes.map((change, ci) =>
                    this.renderChangeRow(change, ci, itemId, svgWidth, graphRow)
                )}
            </React.Fragment>
        );
    }

    protected renderChangeRow(
        change: ScmHistoryItemChange,
        ci: number,
        itemId: string,
        svgWidth: number,
        graphRow: GraphRow
    ): React.ReactElement {
        const rootUri = this.scmService.selectedRepository?.provider.rootUri;
        const uri = change.modifiedUri ?? change.originalUri ?? change.uri;
        const relativePath = getRepoRelativePath(uri, rootUri);
        const fileName = getFileName(relativePath);
        const dirPath = relativePath.includes('/')
            ? relativePath.slice(0, relativePath.lastIndexOf('/'))
            : '';
        const status = getChangeStatus(change);
        const statusClass = status === 'A' ? 'added' : status === 'D' ? 'deleted' : status === 'R' ? 'renamed' : 'modified';
        const resourceUri = new URI(uri);
        const fileIcon = this.labelProvider.getIcon(resourceUri);
        const changeKey = `${itemId}-change-${ci}`;
        const isSelected = this.selectedChangeKey === changeKey;

        return (
            <div
                key={changeKey}
                className={`scm-history-change-row${isSelected ? ' selected' : ''}`}
                onClick={e => this.handleChangeClick(e, change, changeKey)}
                role='treeitem'
                tabIndex={-1}
            >
                {this.renderChangeRowSvg(graphRow, svgWidth)}
                <div className='scm-history-change-info'>
                    <span className={`${fileIcon} file-icon scm-history-change-file-icon`} />
                    <div className='scm-history-change-name-container'>
                        <span className='name scm-history-change-name' title={relativePath}>{fileName}</span>
                        {dirPath && <span className='path scm-history-change-dir'>{dirPath}</span>}
                    </div>
                    <span className={`scm-history-change-status ${statusClass}`}>{status}</span>
                </div>
            </div>
        );
    }

    protected handleChangeClick = (e: React.MouseEvent, change: ScmHistoryItemChange, changeKey: string): void => {
        e.stopPropagation();
        this.selectedChangeKey = changeKey;
        this.update();
        this.openChange(change);
    };

    protected openChange(change: ScmHistoryItemChange): void {
        try {
            if (change.originalUri && change.modifiedUri) {
                const originalUri = new URI(change.originalUri);
                const modifiedUri = new URI(change.modifiedUri);
                const label = getFileName(getFilePath(change.modifiedUri));
                open(this.openerService, DiffUris.encode(originalUri, modifiedUri, label));
            } else if (change.modifiedUri) {
                open(this.openerService, new URI(change.modifiedUri));
            } else if (change.originalUri) {
                open(this.openerService, new URI(change.originalUri));
            } else {
                open(this.openerService, new URI(change.uri));
            }
        } catch (err) {
            console.error('ScmHistoryGraphWidget: failed to open change', err);
        }
    }

    protected renderChangeRowSvg(graphRow: GraphRow, svgWidth: number): React.ReactElement {
        const commitX = graphRow.lane * LANE_WIDTH + 11;
        const commitColor = laneColor(graphRow.color);
        const elements: React.ReactElement[] = [];
        let keyIdx = 0;

        for (const edge of graphRow.edges) {
            if (edge.type !== 'pass-through') {
                continue;
            }
            const x = edge.fromLane * LANE_WIDTH + 11;
            const color = laneColor(edge.color);
            elements.push(
                <path
                    key={`pass-${keyIdx++}`}
                    fill='none'
                    strokeWidth='1px'
                    strokeLinecap='round'
                    d={`M ${x} 0 V 22`}
                    style={{ stroke: color }}
                />
            );
        }

        if (graphRow.hasContinuation) {
            elements.push(
                <path
                    key={`commit-${keyIdx++}`}
                    fill='none'
                    strokeWidth='1px'
                    strokeLinecap='round'
                    d={`M ${commitX} 0 V 22`}
                    style={{ stroke: commitColor }}
                />
            );
        }

        return (
            <svg
                className='scm-history-graph-svg'
                style={{ height: `${ROW_HEIGHT}px`, width: `${svgWidth}px` }}
            >
                {elements}
            </svg>
        );
    }

    /**
     * Renders the SVG graph column for a commit row, matching VS Code's SVG structure:
     *
     * - Each lane is 22px wide; circle cx = lane * 22 + 11, cy = 11
     * - Pass-through lanes: full vertical line M x 0 V 22
     * - Commit lane: top segment (M commitX 0 V 11) + bottom segment (M commitX 11 V 22)
     * - HEAD/current commit (first entry): r=7 with inner dot, NO top segment
     * - Normal commit: r=5
     * - Branch-out edge: diagonal S-curve bezier from commit position (commitX, cy)
     *   sweeping down to the new lane at the bottom: M commitX cy C commitX 22 newX cy newX 22
     * - Merge-in edge: bezier from the source lane at the top curving into
     *   the commit position: M srcX 0 C srcX cy commitX cy commitX cy
     */
    protected renderGraphSvg(row: GraphRow, svgWidth: number, isHead: boolean): React.ReactElement {
        const commitX = row.lane * LANE_WIDTH + 11;
        const cy = DOT_CY;
        const commitColor = laneColor(row.color);

        const elements: React.ReactElement[] = [];
        let keyIdx = 0;

        // Pass-through lines: straight vertical line through the full row height
        for (const edge of row.edges) {
            if (edge.type !== 'pass-through') {
                continue;
            }
            const x = edge.fromLane * LANE_WIDTH + 11;
            const color = laneColor(edge.color);
            elements.push(
                <path
                    key={`pass-${keyIdx++}`}
                    fill='none'
                    strokeWidth='1px'
                    strokeLinecap='round'
                    d={`M ${x} 0 V 22`}
                    style={{ stroke: color }}
                />
            );
        }

        // Merge-in edges: source lane at top curves into the commit position (mid-row)
        for (const edge of row.edges) {
            if (edge.type !== 'merge-in') {
                continue;
            }
            const srcX = edge.fromLane * LANE_WIDTH + 11;
            const color = laneColor(edge.color);
            // Cubic bezier: start at (srcX, 0), control points pull both ends to mid-row,
            // end at commit position (commitX, cy)
            const d = `M ${srcX} 0 C ${srcX} ${cy}, ${commitX} ${cy}, ${commitX} ${cy}`;
            elements.push(
                <path
                    key={`merge-${keyIdx++}`}
                    fill='none'
                    strokeWidth='1px'
                    strokeLinecap='round'
                    d={d}
                    style={{ stroke: color }}
                />
            );
        }

        // Commit lane lines — split at cy=11
        // Top segment: only drawn if there is an incoming line from above
        // (i.e. this commit was referenced as a parent by an earlier row)
        if (row.hasTopLine) {
            elements.push(
                <path
                    key={`top-${keyIdx++}`}
                    fill='none'
                    strokeWidth='1px'
                    strokeLinecap='round'
                    d={`M ${commitX} 0 V ${cy}`}
                    style={{ stroke: commitColor }}
                />
            );
        }
        // Bottom segment: only drawn if the lane continues to a parent below
        if (row.hasContinuation) {
            elements.push(
                <path
                    key={`bottom-${keyIdx++}`}
                    fill='none'
                    strokeWidth='1px'
                    strokeLinecap='round'
                    d={`M ${commitX} ${cy} V 22`}
                    style={{ stroke: commitColor }}
                />
            );
        }

        // Branch-out edges: commit position (mid-row) curves down to a new lane at bottom
        for (const edge of row.edges) {
            if (edge.type !== 'branch-out') {
                continue;
            }
            const dstX = edge.toLane * LANE_WIDTH + 11;
            const color = laneColor(edge.color);
            // Diagonal S-curve bezier: CP1 keeps x at srcX while y goes to bottom;
            // CP2 keeps y at cy while x reaches dstX — produces a smooth sweep
            // down-and-right (or left) from the commit circle to the target lane.
            const srcX = edge.fromLane * LANE_WIDTH + 11;
            const d = `M ${srcX} ${cy} C ${srcX} 22, ${dstX} ${cy}, ${dstX} 22`;
            elements.push(
                <path
                    key={`branch-${keyIdx++}`}
                    fill='none'
                    strokeWidth='1px'
                    strokeLinecap='round'
                    d={d}
                    style={{ stroke: color }}
                />
            );
        }

        // Commit circle — drawn last so it renders on top of all lines
        if (isHead) {
            elements.push(
                <circle
                    key={`circle-${keyIdx++}`}
                    cx={commitX}
                    cy={cy}
                    r={7}
                    style={{ strokeWidth: '2px', fill: commitColor }}
                />
            );
            elements.push(
                <circle
                    key={`inner-${keyIdx++}`}
                    cx={commitX}
                    cy={cy}
                    r={2}
                    style={{ strokeWidth: '4px', fill: 'var(--theia-editor-background)', stroke: 'var(--theia-editor-background)' }}
                />
            );
        } else {
            elements.push(
                <circle
                    key={`circle-${keyIdx++}`}
                    cx={commitX}
                    cy={cy}
                    r={5}
                    style={{ strokeWidth: '2px', fill: commitColor }}
                />
            );
        }

        return (
            <svg
                className='scm-history-graph-svg'
                style={{ height: `${ROW_HEIGHT}px`, width: `${svgWidth}px` }}
            >
                {elements}
            </svg>
        );
    }

    protected renderRefBadges(refs?: readonly ScmHistoryItemRef[], entry?: HistoryGraphEntry): React.ReactNode {
        if (!refs || refs.length === 0) {
            return undefined;
        }

        const laneColorValue = entry ? laneColor(entry.graphRow.color) : undefined;
        const deduplicated = deduplicateRefs(refs);
        const style: React.CSSProperties = laneColorValue
            ? { backgroundColor: laneColorValue, color: 'var(--theia-scmGraph-historyItemRefForeground, var(--theia-badge-foreground))' }
            : {};

        const badges: React.ReactElement[] = [];
        for (const info of deduplicated) {
            if (badges.length >= 3) {
                break;
            }
            const { ref, hasBoth } = info as DeduplicatedRef;
            const isTag = isTagRef(ref);
            const isRemote = isRemoteRef(ref);
            const onContextMenu = entry ? (e: React.MouseEvent) => this.handleRefBadgeContextMenu(e, entry, ref) : undefined;

            if (isTag) {
                badges.push(renderJsxRefBadge(ref, 'codicon-tag', false, style, ref.id, onContextMenu));
            } else if (isRemote) {
                badges.push(renderJsxRefBadge(ref, 'codicon-cloud', true, style, ref.id, onContextMenu));
            } else {
                badges.push(renderJsxRefBadge(ref, 'codicon-git-branch', true, style, ref.id, onContextMenu));
                if (hasBoth && badges.length < 3) {
                    badges.push(
                        <span
                            key={`${ref.id}-cloud`}
                            className='scm-history-ref-badge scm-history-ref-badge-cloud'
                            title={ref.description ?? ref.name}
                            style={style}
                        >
                            <i className='codicon codicon-cloud scm-history-ref-icon' />
                        </span>
                    );
                }
            }
        }
        return badges;
    }

    protected handleRowContextMenu = (e: React.MouseEvent, entry: HistoryGraphEntry): void => {
        e.preventDefault();
        e.stopPropagation();
        const repo = this.scmService.selectedRepository;
        if (!repo) {
            return;
        }
        const { item } = entry;
        if (item.references && item.references.length > 0) {
            this.scmContextKeys.scmHistoryItemRef.set(item.references[0].id);
        } else {
            this.scmContextKeys.scmHistoryItemRef.set(undefined);
        }
        const sourceControlHandle = repo.provider.handle;
        const args = sourceControlHandle !== undefined
            ? [{ sourceControlHandle }, { sourceControlHandle, id: item.id, type: 'historyItem' as const }]
            : [];
        this.contextMenuRenderer.render({
            menuPath: SCM_HISTORY_ITEM_CONTEXT_MENU,
            anchor: e.nativeEvent,
            args,
            context: this.node
        });
    };

    protected handleRefBadgeContextMenu = (e: React.MouseEvent, entry: HistoryGraphEntry, ref: ScmHistoryItemRef): void => {
        e.preventDefault();
        e.stopPropagation();
        const repo = this.scmService.selectedRepository;
        if (!repo) {
            return;
        }
        this.scmContextKeys.scmHistoryItemRef.set(ref.id);
        const sourceControlHandle = repo.provider.handle;
        const args = sourceControlHandle !== undefined
            ? [{ sourceControlHandle }, { sourceControlHandle, id: ref.id, type: 'historyItemRef' as const }]
            : [];
        this.contextMenuRenderer.render({
            menuPath: SCM_HISTORY_ITEM_REF_CONTEXT_MENU,
            anchor: e.nativeEvent,
            args,
            context: this.node
        });
    };

    protected handleRowClick = (idx: number, entry: HistoryGraphEntry): void => {
        this.selectedIndex = idx;
        const { item } = entry;

        if (this.expandedIds.has(item.id)) {
            this.expandedIds.delete(item.id);
            const cts = this.loadChangesCts.get(item.id);
            if (cts) {
                cts.cancel();
                cts.dispose();
                this.loadChangesCts.delete(item.id);
            }
        } else {
            this.expandedIds.add(item.id);
            if (!this.expandedChanges.has(item.id)) {
                this.loadChanges(entry);
            }
        }

        this.update();
    };

    protected async loadChanges(entry: HistoryGraphEntry): Promise<void> {
        const { item } = entry;
        const provider = this.model.provider;
        if (!provider) {
            this.expandedChanges.set(item.id, []);
            this.update();
            return;
        }

        this.expandedChanges.set(item.id, 'loading');
        this.update();

        const cts = new CancellationTokenSource();
        this.loadChangesCts.set(item.id, cts);
        this.toDispose.push(cts);
        try {
            const parentId = item.parentIds?.[0];
            const changes = await provider.provideHistoryItemChanges(item.id, parentId, cts.token);
            if (!cts.token.isCancellationRequested) {
                this.expandedChanges.set(item.id, changes ?? []);
                this.update();
            }
        } catch (err) {
            if (!cts.token.isCancellationRequested) {
                console.error('ScmHistoryGraphWidget: failed to load changes', err);
                this.expandedChanges.set(item.id, []);
                this.update();
            }
        } finally {
            this.loadChangesCts.delete(item.id);
        }
    }

    protected handleLoadMore = (): void => {
        this.model.loadMore();
    };

    protected handleLoadMoreKey = (e: React.KeyboardEvent): void => {
        if (e.key === 'Enter' || e.key === ' ') {
            this.model.loadMore();
        }
    };

}
