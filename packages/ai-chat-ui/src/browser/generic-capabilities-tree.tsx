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

import * as React from '@theia/core/shared/react';
import { nls } from '@theia/core';
import { HoverService } from '@theia/core/lib/browser';
import { CAPABILITY_TYPE_PROMPT_MAP, GenericCapabilitySelections } from '@theia/ai-core';
import { AvailableGenericCapabilities, GenericCapabilityItem, GenericCapabilityGroup } from './generic-capabilities-service';

export interface GenericCapabilitiesTreeProps {
    /** Current generic capability selections */
    genericCapabilities: GenericCapabilitySelections;
    /** Called when a capability type's selection changes */
    onGenericCapabilityChange: (type: keyof GenericCapabilitySelections, ids: string[]) => void;
    /** Available capabilities to select from */
    availableCapabilities: AvailableGenericCapabilities;
    /** Items already in the agent prompt that should be disabled/greyed */
    disabledCapabilities: GenericCapabilitySelections;
    /** Whether the section is disabled */
    disabled?: boolean;
    /** Hover service for tooltips */
    hoverService: HoverService;
}

// Root node descriptions for tooltips
const ROOT_DESCRIPTIONS: Record<string, () => string> = {
    skills: () => nls.localize('theia/ai/chat-ui/skillsDescription', 'Reusable skill instructions that can be added to the conversation'),
    variables: () => nls.localize('theia/ai/chat-ui/variablesDescription', 'Dynamic variables that provide context information'),
    mcpFunctions: () => nls.localize('theia/ai/chat-ui/mcpFunctionsDescription', 'Model Context Protocol (MCP) functions from connected servers'),
    functions: () => nls.localize('theia/ai/chat-ui/functionsDescription', 'Built-in functions provided by Theia extensions'),
    promptFragments: () => nls.localize('theia/ai/chat-ui/promptFragmentsDescription', 'Custom prompt fragments to include in the conversation'),
    agentDelegation: () => nls.localize('theia/ai/chat-ui/agentDelegationDescription', 'Other AI agents that can be delegated to')
};

type CapabilityType = keyof GenericCapabilitySelections;

interface TreeNodeData {
    id: string;
    type: 'root' | 'group' | 'item';
    name: string;
    capabilityType?: CapabilityType;
    groupName?: string;
    description?: string;
    selected?: boolean;
    disabled?: boolean;
    expanded?: boolean;
    children?: TreeNodeData[];
    /** The original capability item ID (for leaf items only) */
    itemId?: string;
}

type CheckboxState = 'checked' | 'unchecked' | 'indeterminate';

/** Props for the parent node checkbox component */
interface ParentCheckboxProps {
    checkboxState: CheckboxState;
    name: string;
    onClick: (e: React.MouseEvent) => void;
    hoverService: HoverService;
}

/** Component for rendering parent node checkbox with indeterminate state support */
const ParentCheckbox: React.FC<ParentCheckboxProps> = ({ checkboxState, name, onClick, hoverService }) => {
    // eslint-disable-next-line no-null/no-null
    const checkboxRef = React.useRef<HTMLInputElement>(null);

    // Update indeterminate state via ref (can't be set via attribute)
    React.useEffect(() => {
        if (checkboxRef.current) {
            checkboxRef.current.indeterminate = checkboxState === 'indeterminate';
        }
    }, [checkboxState]);

    return (
        <input
            ref={checkboxRef}
            type="checkbox"
            className="theia-input theia-GenericCapabilities-TreeNode-Checkbox"
            checked={checkboxState === 'checked'}
            aria-label={name}
            onChange={() => { /* handled by onClick */ }}
            onClick={onClick}
            tabIndex={-1}
            onMouseEnter={e => {
                hoverService.requestHover({
                    content: checkboxState === 'checked' || checkboxState === 'indeterminate'
                        ? nls.localize('theia/ai/chat-ui/unselectAllInCategory', 'Unselect all in this category')
                        : nls.localize('theia/ai/chat-ui/selectAllInCategory', 'Select all in this category'),
                    target: e.currentTarget as HTMLElement,
                    position: 'bottom'
                });
            }}
        />
    );
};

/**
 * A unified tree component for selecting generic capabilities.
 * Shows all capability types as root nodes, with groups and items as children.
 * Includes search functionality and keyboard navigation.
 */
export const GenericCapabilitiesTree: React.FunctionComponent<GenericCapabilitiesTreeProps> = ({
    genericCapabilities,
    onGenericCapabilityChange,
    availableCapabilities,
    disabledCapabilities,
    disabled,
    hoverService
}) => {
    const [searchQuery, setSearchQuery] = React.useState('');
    const [expandedNodes, setExpandedNodes] = React.useState<Set<string>>(new Set());
    const [focusedNodeId, setFocusedNodeId] = React.useState<string | undefined>(undefined);
    // eslint-disable-next-line no-null/no-null
    const treeRef = React.useRef<HTMLDivElement>(null);
    // eslint-disable-next-line no-null/no-null
    const searchInputRef = React.useRef<HTMLInputElement>(null);

    // Build the tree data structure
    // Order: Skills, MCP, Agents, Functions, Prompts, Variables
    const treeData = React.useMemo((): TreeNodeData[] => {
        const buildFlatRootNode = (
            rootId: string,
            label: string,
            capabilityType: CapabilityType,
            items: GenericCapabilityItem[]
        ): TreeNodeData | undefined => {
            if (items.length === 0) {
                return undefined;
            }
            const selected = new Set(genericCapabilities[capabilityType] || []);
            const disabledIds = new Set(disabledCapabilities[capabilityType] || []);
            return {
                id: `root-${rootId}`,
                type: 'root',
                name: label,
                capabilityType,
                children: items.map(item => ({
                    id: `item-${rootId}-${item.id}`,
                    type: 'item' as const,
                    name: item.name,
                    description: item.description,
                    capabilityType,
                    itemId: item.id,
                    selected: selected.has(item.id) || disabledIds.has(item.id),
                    disabled: disabledIds.has(item.id)
                }))
            };
        };

        const buildGroupedRootNode = (
            rootId: string,
            label: string,
            capabilityType: CapabilityType,
            groups: GenericCapabilityGroup[]
        ): TreeNodeData | undefined => {
            if (groups.length === 0) {
                return undefined;
            }
            const selected = new Set(genericCapabilities[capabilityType] || []);
            const disabledIds = new Set(disabledCapabilities[capabilityType] || []);
            return {
                id: `root-${rootId}`,
                type: 'root',
                name: label,
                capabilityType,
                children: groups.map(group => ({
                    id: `group-${rootId}-${group.name}`,
                    type: 'group' as const,
                    name: group.name,
                    groupName: group.name,
                    capabilityType,
                    children: group.items.map(item => ({
                        id: `item-${rootId}-${item.id}`,
                        type: 'item' as const,
                        name: item.name,
                        description: item.description,
                        capabilityType,
                        groupName: group.name,
                        itemId: item.id,
                        selected: selected.has(item.id) || disabledIds.has(item.id),
                        disabled: disabledIds.has(item.id)
                    }))
                }))
            };
        };

        return [
            buildFlatRootNode('skills', nls.localizeByDefault('Skills'), 'skills', availableCapabilities.skills),
            buildGroupedRootNode('mcp', nls.localize('theia/ai/chat-ui/mcpFunctions', 'MCP'), 'mcpFunctions', availableCapabilities.mcpFunctions),
            buildFlatRootNode('agents', nls.localizeByDefault('Agents'), 'agentDelegation', availableCapabilities.agentDelegation),
            buildGroupedRootNode('functions', nls.localize('theia/ai/chat-ui/functions', 'Functions'), 'functions', availableCapabilities.functions),
            buildFlatRootNode('prompts', nls.localize('theia/ai/chat-ui/promptFragments', 'Prompts'), 'promptFragments', availableCapabilities.promptFragments),
            buildFlatRootNode('variables', nls.localizeByDefault('Variables'), 'variables', availableCapabilities.variables),
        ].filter((node): node is TreeNodeData => node !== undefined);
    }, [availableCapabilities, genericCapabilities, disabledCapabilities]);

    // Filter tree based on search query
    const filteredTree = React.useMemo((): TreeNodeData[] => {
        if (!searchQuery.trim()) {
            return treeData;
        }

        const query = searchQuery.toLowerCase();

        const filterNode = (node: TreeNodeData): TreeNodeData | undefined => {
            const nameMatches = node.name.toLowerCase().includes(query);
            const descMatches = node.description?.toLowerCase().includes(query) || false;

            if (node.children && node.children.length > 0) {
                const filteredChildren = node.children
                    .map(child => filterNode(child))
                    .filter((child): child is TreeNodeData => child !== undefined);

                // If any children match or this node itself matches, include it
                if (filteredChildren.length > 0 || nameMatches || descMatches) {
                    return {
                        ...node,
                        // If node matches, show all children; otherwise show only filtered children
                        children: (nameMatches || descMatches) ? node.children : filteredChildren
                    };
                }
            } else if (nameMatches || descMatches) {
                return node;
            }

            return undefined;
        };

        return treeData
            .map(node => filterNode(node))
            .filter((node): node is TreeNodeData => node !== undefined);
    }, [treeData, searchQuery]);

    // Track previous search query to detect actual search changes vs other re-renders
    const prevSearchQueryRef = React.useRef(searchQuery);

    // Auto-expand when searching; collapse only when search transitions from non-empty to empty
    React.useEffect(() => {
        const prev = prevSearchQueryRef.current;
        prevSearchQueryRef.current = searchQuery;

        if (searchQuery.trim()) {
            const allIds = new Set<string>();
            const collectIds = (nodes: TreeNodeData[]): void => {
                for (const node of nodes) {
                    allIds.add(node.id);
                    if (node.children) {
                        collectIds(node.children);
                    }
                }
            };
            collectIds(filteredTree);
            setExpandedNodes(allIds);

            if (focusedNodeId && !allIds.has(focusedNodeId)) {
                setFocusedNodeId(undefined);
            }
        } else if (prev.trim()) {
            // Only collapse when search was cleared, not on every re-render
            setExpandedNodes(new Set());
        }
    }, [searchQuery, filteredTree, focusedNodeId]);

    // Get all visible node IDs for keyboard navigation
    const getVisibleNodeIds = React.useCallback((): string[] => {
        const ids: string[] = [];
        const collect = (nodes: TreeNodeData[]): void => {
            for (const node of nodes) {
                ids.push(node.id);
                if (node.children && expandedNodes.has(node.id)) {
                    collect(node.children);
                }
            }
        };
        collect(filteredTree);
        return ids;
    }, [filteredTree, expandedNodes]);

    const toggleExpand = (nodeId: string): void => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    };

    // Calculate checkbox state for parent nodes (root or group)
    // Disabled items are completely ignored - they don't affect parent checkbox state
    const getParentCheckboxState = (node: TreeNodeData): CheckboxState => {
        if (!node.children || node.children.length === 0) {
            return 'unchecked';
        }

        const allItems = getAllLeafItems(node);
        // Only consider enabled items for checkbox state
        const enabledItems = allItems.filter(item => !item.disabled);

        if (enabledItems.length === 0) {
            // All items are disabled, show unchecked
            return 'unchecked';
        }

        const enabledSelectedCount = enabledItems.filter(item => item.selected).length;

        if (enabledSelectedCount === enabledItems.length) {
            return 'checked';
        } else if (enabledSelectedCount > 0) {
            return 'indeterminate';
        }
        return 'unchecked';
    };

    // Get all leaf items under a node
    const getAllLeafItems = (node: TreeNodeData): TreeNodeData[] => {
        const items: TreeNodeData[] = [];
        const collect = (n: TreeNodeData): void => {
            if (n.type === 'item') {
                items.push(n);
            } else if (n.children) {
                n.children.forEach(collect);
            }
        };
        collect(node);
        return items;
    };

    // Toggle all items under a parent node (for checkbox click)
    const handleParentCheckboxToggle = (node: TreeNodeData, e?: React.MouseEvent): void => {
        e?.stopPropagation();
        if (!node.capabilityType) {
            return;
        }

        const checkboxState = getParentCheckboxState(node);
        const current = new Set(getCapabilityIds(node.capabilityType));
        const disabledIds = new Set(getDisabledIds(node.capabilityType));
        const itemsToToggle = getAvailableItemIds(node.capabilityType, node.groupName);

        if (checkboxState === 'checked' || checkboxState === 'indeterminate') {
            // Uncheck all (except disabled items)
            for (const id of itemsToToggle) {
                if (!disabledIds.has(id)) {
                    current.delete(id);
                }
            }
        } else {
            // Check all (except disabled items)
            for (const id of itemsToToggle) {
                if (!disabledIds.has(id)) {
                    current.add(id);
                }
            }
        }

        onGenericCapabilityChange(node.capabilityType, Array.from(current));
    };

    const handleResetAll = (): void => {
        // Clear all selections across all capability types (except disabled items)
        for (const { type } of CAPABILITY_TYPE_PROMPT_MAP) {
            const disabledIds = new Set(getDisabledIds(type));
            const currentIds = getCapabilityIds(type);
            // Keep only disabled items that are selected
            const remaining = currentIds.filter(id => disabledIds.has(id));
            if (remaining.length !== currentIds.length) {
                onGenericCapabilityChange(type, remaining);
            }
        }
        // Also collapse all and clear search
        setExpandedNodes(new Set());
        setSearchQuery('');
    };

    const handleItemToggle = (capabilityType: CapabilityType, itemId: string): void => {
        const current = new Set(getCapabilityIds(capabilityType));
        const disabledIds = new Set(getDisabledIds(capabilityType));

        if (disabledIds.has(itemId)) {
            return; // Can't toggle disabled items
        }

        if (current.has(itemId)) {
            current.delete(itemId);
        } else {
            current.add(itemId);
        }

        onGenericCapabilityChange(capabilityType, Array.from(current));
    };

    const getIdsForType = (source: GenericCapabilitySelections, type: CapabilityType): string[] =>
        source[type] || [];

    const getCapabilityIds = (type: CapabilityType): string[] =>
        getIdsForType(genericCapabilities, type);

    const getDisabledIds = (type: CapabilityType): string[] =>
        getIdsForType(disabledCapabilities, type);

    const getAvailableItemIds = (type: CapabilityType, groupName?: string): string[] => {
        const getItems = (items: GenericCapabilityItem[]): string[] => items.map(i => i.id);
        const getGroupItems = (groups: GenericCapabilityGroup[], filterGroup?: string): string[] => {
            const filtered = filterGroup ? groups.filter(g => g.name === filterGroup) : groups;
            return filtered.flatMap(g => g.items.map(i => i.id));
        };

        switch (type) {
            case 'skills': return getItems(availableCapabilities.skills);
            case 'variables': return getItems(availableCapabilities.variables);
            case 'mcpFunctions': return getGroupItems(availableCapabilities.mcpFunctions, groupName);
            case 'functions': return getGroupItems(availableCapabilities.functions, groupName);
            case 'promptFragments': return getItems(availableCapabilities.promptFragments);
            case 'agentDelegation': return getItems(availableCapabilities.agentDelegation);
            default: return [];
        }
    };

    const findNode = (nodes: TreeNodeData[], id: string): TreeNodeData | undefined => {
        for (const node of nodes) {
            if (node.id === id) {
                return node;
            }
            if (node.children) {
                const found = findNode(node.children, id);
                if (found) {
                    return found;
                }
            }
        }
        return undefined;
    };

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent): void => {
        if (disabled) {
            return;
        }

        const visibleIds = getVisibleNodeIds();
        const currentIndex = focusedNodeId ? visibleIds.indexOf(focusedNodeId) : -1;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (currentIndex < visibleIds.length - 1) {
                    setFocusedNodeId(visibleIds[currentIndex + 1]);
                } else if (visibleIds.length > 0) {
                    setFocusedNodeId(visibleIds[0]);
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (currentIndex > 0) {
                    setFocusedNodeId(visibleIds[currentIndex - 1]);
                } else if (visibleIds.length > 0) {
                    setFocusedNodeId(visibleIds[visibleIds.length - 1]);
                }
                break;
            case 'ArrowRight':
                if (focusedNodeId && !expandedNodes.has(focusedNodeId)) {
                    e.preventDefault();
                    toggleExpand(focusedNodeId);
                }
                break;
            case 'ArrowLeft':
                if (focusedNodeId && expandedNodes.has(focusedNodeId)) {
                    e.preventDefault();
                    toggleExpand(focusedNodeId);
                }
                break;
            case 'Enter':
            case ' ':
                if (focusedNodeId) {
                    e.preventDefault();
                    const foundNode = findNode(filteredTree, focusedNodeId);
                    if (foundNode) {
                        if (foundNode.type === 'item' && foundNode.capabilityType && foundNode.itemId && !foundNode.disabled) {
                            handleItemToggle(foundNode.capabilityType, foundNode.itemId);
                        } else if ((foundNode.type === 'root' || foundNode.type === 'group') && foundNode.capabilityType) {
                            // Toggle checkbox for parent nodes on Enter/Space
                            handleParentCheckboxToggle(foundNode);
                        }
                    }
                }
                break;
            case 'Home':
                e.preventDefault();
                if (visibleIds.length > 0) {
                    setFocusedNodeId(visibleIds[0]);
                }
                break;
            case 'End':
                e.preventDefault();
                if (visibleIds.length > 0) {
                    setFocusedNodeId(visibleIds[visibleIds.length - 1]);
                }
                break;
        }
    };

    // Scroll focused node into view
    React.useEffect(() => {
        if (focusedNodeId && treeRef.current) {
            const focusedElement = treeRef.current.querySelector(`[data-node-id="${focusedNodeId}"]`);
            if (focusedElement) {
                focusedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [focusedNodeId]);

    const renderNode = (node: TreeNodeData, depth: number = 0): React.ReactNode => {
        const isExpanded = expandedNodes.has(node.id);
        const isFocused = focusedNodeId === node.id;

        if (node.type === 'item') {
            return (
                <div
                    key={node.id}
                    data-node-id={node.id}
                    className={`theia-GenericCapabilities-TreeItem${node.disabled ? ' theia-mod-disabled' : ''}${isFocused ? ' theia-mod-selected' : ''}`}
                    style={{ '--tree-indent': `${(depth * 12) + 8}px` } as React.CSSProperties}
                    onClick={() => node.capabilityType && node.itemId && handleItemToggle(node.capabilityType, node.itemId)}
                    onMouseDown={() => setFocusedNodeId(node.id)}
                    role="treeitem"
                    aria-selected={isFocused}
                    aria-checked={node.selected}
                    aria-disabled={node.disabled}
                    onMouseEnter={e => {
                        hoverService.requestHover({
                            content: node.description || node.name,
                            target: e.currentTarget as HTMLElement,
                            position: 'bottom'
                        });
                    }}
                >
                    <input
                        type="checkbox"
                        className="theia-input theia-GenericCapabilities-TreeItem-Checkbox"
                        checked={node.selected}
                        disabled={node.disabled}
                        aria-label={node.name}
                        onChange={() => { /* handled by parent div onClick */ }}
                        tabIndex={-1}
                    />
                    <span className="theia-GenericCapabilities-TreeItem-Name">{node.name}</span>
                </div>
            );
        }

        // Root or group node
        const isRoot = node.type === 'root';
        const checkboxState = getParentCheckboxState(node);

        return (
            <div key={node.id} className={`theia-GenericCapabilities-TreeNode${isRoot ? ' root' : ' group'}`}>
                <div
                    data-node-id={node.id}
                    className={`theia-GenericCapabilities-TreeNodeHeader${isFocused ? ' theia-mod-selected' : ''}`}
                    style={{ '--tree-indent': `${(depth * 12) + 4}px` } as React.CSSProperties}
                    onClick={() => toggleExpand(node.id)}
                    onMouseDown={() => setFocusedNodeId(node.id)}
                    role="treeitem"
                    aria-expanded={isExpanded}
                >
                    <ParentCheckbox
                        checkboxState={checkboxState}
                        name={node.name}
                        onClick={e => handleParentCheckboxToggle(node, e)}
                        hoverService={hoverService}
                    />
                    <span className={`codicon ${isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'} theia-GenericCapabilities-TreeNode-Chevron`} />
                    <span
                        className="theia-GenericCapabilities-TreeNode-Name"
                        onMouseEnter={isRoot && node.capabilityType ? e => {
                            const description = ROOT_DESCRIPTIONS[node.capabilityType!]?.() || node.name;
                            hoverService.requestHover({
                                content: `${node.name}: ${description}`,
                                target: e.currentTarget as HTMLElement,
                                position: 'bottom'
                            });
                        } : undefined}
                    >{node.name}</span>
                </div>
                {isExpanded && node.children && (
                    <div className="theia-GenericCapabilities-TreeNodeChildren" role="group">
                        {node.children.map(child => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    if (filteredTree.length === 0 && !searchQuery.trim()) {
        return undefined;
    }

    return (
        <div className={`theia-GenericCapabilities-Tree${disabled ? ' disabled' : ''}`}>
            <div className="theia-GenericCapabilities-Tree-SearchContainer">
                <input
                    ref={searchInputRef}
                    type="text"
                    className="theia-input theia-GenericCapabilities-Tree-SearchInput"
                    placeholder={nls.localize('theia/ai/chat-ui/searchCapabilities', 'Search capabilities...')}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    aria-label={nls.localize('theia/ai/chat-ui/searchCapabilities', 'Search capabilities')}
                    autoFocus
                />
                <div className="theia-GenericCapabilities-Tree-SearchActions">
                    <button
                        className="theia-GenericCapabilities-Tree-SearchAction"
                        onClick={handleResetAll}
                        aria-label={nls.localize('theia/ai/chat-ui/clearAllSelections', 'Clear search string and capability selections')}
                        onMouseEnter={e => {
                            hoverService.requestHover({
                                content: nls.localize('theia/ai/chat-ui/clearAllSelections', 'Clear search string and capability selections'),
                                target: e.currentTarget as HTMLElement,
                                position: 'bottom'
                            });
                        }}
                    >
                        <span className="codicon codicon-clear-all" />
                    </button>
                    <button
                        className="theia-GenericCapabilities-Tree-SearchAction"
                        onClick={() => setExpandedNodes(new Set())}
                        aria-label={nls.localize('theia/ai/chat-ui/collapseAll', 'Collapse all')}
                        onMouseEnter={e => {
                            hoverService.requestHover({
                                content: nls.localize('theia/ai/chat-ui/collapseAll', 'Collapse all'),
                                target: e.currentTarget as HTMLElement,
                                position: 'bottom'
                            });
                        }}
                    >
                        <span className="codicon codicon-collapse-all" />
                    </button>
                </div>
            </div>
            <div
                ref={treeRef}
                className="theia-GenericCapabilities-Tree-Content"
                role="tree"
                aria-label={nls.localize('theia/ai/chat-ui/genericCapabilities', 'Generic Capabilities')}
                tabIndex={0}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                    if (!focusedNodeId && filteredTree.length > 0) {
                        setFocusedNodeId(filteredTree[0].id);
                    }
                }}
            >
                {filteredTree.length > 0 ? (
                    filteredTree.map(node => renderNode(node, 0))
                ) : (
                    <div className="theia-GenericCapabilities-Tree-Empty">
                        {nls.localize('theia/ai/chat-ui/noMatchingCapabilities', 'No matching capabilities')}
                    </div>
                )}
            </div>
        </div>
    );
};
