// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { codicon, ReactWidget } from '@theia/core/lib/browser';
import { nls } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { generateUuid } from '@theia/core/lib/common/uuid';
import { SketchedToolDefinition, SketchedToolParameterDefinition, SketchedToolParameterType, SketchedToolReturnMode, SketchedToolService } from '../common';

const PARAMETER_TYPES: SketchedToolParameterType[] = ['string', 'number', 'integer', 'boolean', 'object', 'array'];
const ITEM_TYPES: Array<'string' | 'number' | 'integer' | 'boolean' | 'object'> = ['string', 'number', 'integer', 'boolean', 'object'];
const MAX_NESTING_DEPTH = 2;

interface ToolListItemProps {
    tool: SketchedToolDefinition;
    isSelected: boolean;
    onSelect: (tool: SketchedToolDefinition) => void;
    onDelete: (id: string) => void;
}

function ToolListItem({ tool, isSelected, onSelect, onDelete }: ToolListItemProps): React.ReactElement {
    const handleClick = React.useCallback(() => onSelect(tool), [tool, onSelect]);
    const handleDelete = React.useCallback((e: React.MouseEvent): void => {
        e.stopPropagation();
        onDelete(tool.id);
    }, [tool.id, onDelete]);
    return (
        <li
            className={`theia-TreeNode theia-CompositeTreeNode${isSelected ? ' theia-mod-selected' : ''}`}
            onClick={handleClick}
        >
            <span className='ai-sketchpad-list-item-label'>{tool.name}</span>
            <span
                className={`ai-sketchpad-delete-icon ${codicon('trash')}`}
                title={nls.localizeByDefault('Delete')}
                onClick={handleDelete}
            />
        </li>
    );
}

interface ToolDetailFormProps {
    tool: SketchedToolDefinition;
    onSave: (tool: SketchedToolDefinition) => void;
    onDelete: (id: string) => void;
}

function ToolDetailForm({ tool: initialTool, onSave, onDelete }: ToolDetailFormProps): React.ReactElement {
    const [tool, setTool] = React.useState<SketchedToolDefinition>(deepCopy(initialTool));
    const [isDirty, setIsDirty] = React.useState(false);

    React.useEffect(() => {
        setTool(deepCopy(initialTool));
        setIsDirty(false);
    }, [initialTool.id]);

    const updateField = (field: 'name' | 'description' | 'staticReturn', value: string): void => {
        setTool(prev => ({ ...prev, [field]: value }));
        setIsDirty(true);
    };

    const updateReturnMode = (mode: SketchedToolReturnMode): void => {
        setTool(prev => ({ ...prev, returnMode: mode }));
        setIsDirty(true);
    };

    const getParamsAtPath = (params: SketchedToolParameterDefinition[], path: number[]): SketchedToolParameterDefinition[] | undefined => {
        let current = params;
        for (const index of path) {
            if (index < 0 || index >= current.length) {
                return undefined;
            }
            const param = current[index];
            if (!param.properties) {
                param.properties = [];
            }
            current = param.properties;
        }
        return current;
    };

    const getItemPropertiesAtPath = (params: SketchedToolParameterDefinition[], path: number[]): SketchedToolParameterDefinition[] | undefined => {
        let current = params;
        for (let i = 0; i < path.length - 1; i++) {
            const index = path[i];
            if (index < 0 || index >= current.length) {
                return undefined;
            }
            const param = current[index];
            if (!param.properties) {
                param.properties = [];
            }
            current = param.properties;
        }
        const lastIndex = path[path.length - 1];
        if (lastIndex < 0 || lastIndex >= current.length) {
            return undefined;
        }
        const param = current[lastIndex];
        if (!param.itemProperties) {
            param.itemProperties = [];
        }
        return param.itemProperties;
    };

    const updateParameter = (path: number[], field: string, value: unknown): void => {
        if (path.length === 0) {
            return;
        }
        setTool(prev => {
            const next = deepCopy(prev);
            const parentPath = path.slice(0, -1);
            const index = path[path.length - 1];
            const params = getParamsAtPath(next.parameters, parentPath);
            if (params && index >= 0 && index < params.length) {
                const param = { ...params[index], [field]: value };
                if (field === 'type' && value === 'object' && !param.properties) {
                    param.properties = [];
                }
                if (field === 'type' && value === 'array' && !param.itemType) {
                    param.itemType = 'string';
                }
                if (field === 'itemType' && value === 'object' && !param.itemProperties) {
                    param.itemProperties = [];
                }
                params[index] = param;
            }
            return next;
        });
        setIsDirty(true);
    };

    const handleAddParameter = (path: number[]): void => {
        const newParam: SketchedToolParameterDefinition = {
            name: '',
            description: '',
            type: 'string'
        };
        setTool(prev => {
            const next = deepCopy(prev);
            const params = getParamsAtPath(next.parameters, path);
            if (params) {
                params.push(newParam);
            }
            return next;
        });
        setIsDirty(true);
    };

    const handleAddItemProperty = (path: number[]): void => {
        const newParam: SketchedToolParameterDefinition = {
            name: '',
            description: '',
            type: 'string'
        };
        setTool(prev => {
            const next = deepCopy(prev);
            const itemProps = getItemPropertiesAtPath(next.parameters, path);
            if (itemProps) {
                itemProps.push(newParam);
            }
            return next;
        });
        setIsDirty(true);
    };

    const handleRemoveParameter = (path: number[]): void => {
        if (path.length === 0) {
            return;
        }
        setTool(prev => {
            const next = deepCopy(prev);
            const parentPath = path.slice(0, -1);
            const index = path[path.length - 1];
            const params = getParamsAtPath(next.parameters, parentPath);
            if (params && index >= 0 && index < params.length) {
                params.splice(index, 1);
            }
            return next;
        });
        setIsDirty(true);
    };

    const handleRemoveItemProperty = (paramPath: number[], propertyIndex: number): void => {
        setTool(prev => {
            const next = deepCopy(prev);
            const itemProps = getItemPropertiesAtPath(next.parameters, paramPath);
            if (itemProps && propertyIndex >= 0 && propertyIndex < itemProps.length) {
                itemProps.splice(propertyIndex, 1);
            }
            return next;
        });
        setIsDirty(true);
    };

    const handleSave = (): void => {
        if (tool.name.trim()) {
            onSave(tool);
            setIsDirty(false);
        }
    };

    const renderParameters = (params: SketchedToolParameterDefinition[], path: number[], depth: number): React.ReactNode => {
        if (params.length === 0) {
            return (
                <div className='ai-sketchpad-no-params'>
                    {nls.localize('theia/ai-tool-sketchpad/noParameters', 'No parameters defined.')}
                </div>
            );
        }
        return (
            <div className='ai-sketchpad-param-list'>
                {params.map((param, index) => renderParameterRow(param, [...path, index], depth))}
            </div>
        );
    };

    const renderItemProperties = (params: SketchedToolParameterDefinition[], paramPath: number[], depth: number): React.ReactNode => {
        if (params.length === 0) {
            return (
                <div className='ai-sketchpad-no-params'>
                    {nls.localize('theia/ai-tool-sketchpad/noItemProperties', 'No item properties defined.')}
                </div>
            );
        }
        return (
            <div className='ai-sketchpad-param-list'>
                {params.map((param, index) => renderItemPropertyRow(param, paramPath, index, depth))}
            </div>
        );
    };

    const renderItemPropertyRow = (param: SketchedToolParameterDefinition, paramPath: number[], propertyIndex: number, depth: number): React.ReactNode => {
        const key = `${paramPath.join('-')}-item-${propertyIndex}`;
        const depthClass = depth > 0 ? ` ai-sketchpad-param-depth-${depth}` : '';
        return (
            <div key={key} className={`ai-sketchpad-param-item${depthClass}`}>
                <div className='ai-sketchpad-param-row'>
                    <input
                        className='theia-input ai-sketchpad-param-name'
                        value={param.name}
                        placeholder={nls.localize('theia/ai-tool-sketchpad/paramName', 'Name')}
                        onChange={e => updateItemProperty(paramPath, propertyIndex, 'name', e.target.value)}
                    />
                    <input
                        className='theia-input ai-sketchpad-param-desc'
                        value={param.description}
                        placeholder={nls.localizeByDefault('Description')}
                        onChange={e => updateItemProperty(paramPath, propertyIndex, 'description', e.target.value)}
                    />
                    <select
                        className='theia-select ai-sketchpad-param-type'
                        value={param.type}
                        onChange={e => updateItemProperty(paramPath, propertyIndex, 'type', e.target.value)}
                    >
                        {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <label className='ai-sketchpad-param-required' title={nls.localize('theia/ai-tool-sketchpad/required', 'Required')}>
                        <input
                            type='checkbox'
                            checked={param.required ?? false}
                            onChange={e => updateItemProperty(paramPath, propertyIndex, 'required', e.target.checked)}
                        />
                        <span>{nls.localize('theia/ai-tool-sketchpad/req', 'Req')}</span>
                    </label>
                    <span
                        className={`ai-sketchpad-param-delete ${codicon('close')}`}
                        title={nls.localizeByDefault('Remove')}
                        onClick={() => handleRemoveItemProperty(paramPath, propertyIndex)}
                    />
                </div>
            </div>
        );
    };

    const updateItemProperty = (paramPath: number[], propertyIndex: number, field: string, value: unknown): void => {
        setTool(prev => {
            const next = deepCopy(prev);
            const itemProps = getItemPropertiesAtPath(next.parameters, paramPath);
            if (itemProps && propertyIndex >= 0 && propertyIndex < itemProps.length) {
                itemProps[propertyIndex] = { ...itemProps[propertyIndex], [field]: value };
            }
            return next;
        });
        setIsDirty(true);
    };

    const renderParameterRow = (param: SketchedToolParameterDefinition, path: number[], depth: number): React.ReactNode => {
        const key = path.join('-');
        const depthClass = depth > 0 ? ` ai-sketchpad-param-depth-${depth}` : '';
        return (
            <div key={key} className={`ai-sketchpad-param-item${depthClass}`}>
                <div className='ai-sketchpad-param-row'>
                    <input
                        className='theia-input ai-sketchpad-param-name'
                        value={param.name}
                        placeholder={nls.localize('theia/ai-tool-sketchpad/paramName', 'Name')}
                        onChange={e => updateParameter(path, 'name', e.target.value)}
                    />
                    <input
                        className='theia-input ai-sketchpad-param-desc'
                        value={param.description}
                        placeholder={nls.localizeByDefault('Description')}
                        onChange={e => updateParameter(path, 'description', e.target.value)}
                    />
                    <select
                        className='theia-select ai-sketchpad-param-type'
                        value={param.type}
                        onChange={e => updateParameter(path, 'type', e.target.value)}
                    >
                        {PARAMETER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <label className='ai-sketchpad-param-required' title={nls.localize('theia/ai-tool-sketchpad/required', 'Required')}>
                        <input
                            type='checkbox'
                            checked={param.required ?? false}
                            onChange={e => updateParameter(path, 'required', e.target.checked)}
                        />
                        <span>{nls.localize('theia/ai-tool-sketchpad/req', 'Req')}</span>
                    </label>
                    <span
                        className={`ai-sketchpad-param-delete ${codicon('close')}`}
                        title={nls.localizeByDefault('Remove')}
                        onClick={() => handleRemoveParameter(path)}
                    />
                </div>
                {param.type === 'object' && depth < MAX_NESTING_DEPTH && (
                    <div className='ai-sketchpad-param-nested'>
                        {renderParameters(param.properties ?? [], path, depth + 1)}
                        <button
                            className='theia-button secondary ai-sketchpad-add-nested-btn'
                            onClick={() => handleAddParameter(path)}
                        >
                            <i className={codicon('add')} />&nbsp;
                            {nls.localize('theia/ai-tool-sketchpad/addProperty', 'Add Property')}
                        </button>
                    </div>
                )}
                {param.type === 'array' && (
                    <div className='ai-sketchpad-param-array-type'>
                        <label>{nls.localize('theia/ai-tool-sketchpad/itemType', 'Item Type:')}</label>
                        <select
                            className='theia-select'
                            value={param.itemType ?? 'string'}
                            onChange={e => updateParameter(path, 'itemType', e.target.value)}
                        >
                            {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                )}
                {param.type === 'array' && param.itemType === 'object' && depth < MAX_NESTING_DEPTH && (
                    <div className='ai-sketchpad-param-nested'>
                        {renderItemProperties(param.itemProperties ?? [], path, depth + 1)}
                        <button
                            className='theia-button secondary ai-sketchpad-add-nested-btn'
                            onClick={() => handleAddItemProperty(path)}
                        >
                            <i className={codicon('add')} />&nbsp;
                            {nls.localize('theia/ai-tool-sketchpad/addItemProperty', 'Add Item Property')}
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className='ai-sketchpad-detail preferences-editor-widget'>
            <div className='ai-sketchpad-form'>
                <div className='ai-sketchpad-form-field'>
                    <label>{nls.localize('theia/ai-tool-sketchpad/toolName', 'Tool Name')}</label>
                    <input
                        className='theia-input'
                        value={tool.name}
                        placeholder={nls.localize('theia/ai-tool-sketchpad/toolNamePlaceholder', 'e.g. getWeather')}
                        onChange={e => updateField('name', e.target.value)}
                    />
                </div>

                <div className='ai-sketchpad-form-field'>
                    <label>{nls.localizeByDefault('Description')}</label>
                    <textarea
                        className='theia-input ai-sketchpad-textarea'
                        value={tool.description}
                        placeholder={nls.localize('theia/ai-tool-sketchpad/descriptionPlaceholder', 'Describe what the tool does...')}
                        onChange={e => updateField('description', e.target.value)}
                        rows={3}
                    />
                </div>

                <div className='ai-sketchpad-form-field'>
                    <label>{nls.localize('theia/ai-tool-sketchpad/parameters', 'Parameters')}</label>
                    {renderParameters(tool.parameters, [], 0)}
                    <button className='theia-button secondary ai-sketchpad-add-param-btn' onClick={() => handleAddParameter([])}>
                        <i className={codicon('add')} />&nbsp;
                        {nls.localize('theia/ai-tool-sketchpad/addParameter', 'Add Parameter')}
                    </button>
                </div>

                <div className='ai-sketchpad-form-field'>
                    <label>{nls.localize('theia/ai-tool-sketchpad/returnMode', 'Return Mode')}</label>
                    <select
                        className='theia-select'
                        value={tool.returnMode ?? 'static'}
                        onChange={e => updateReturnMode(e.target.value as SketchedToolReturnMode)}
                    >
                        <option value='static'>
                            {nls.localize('theia/ai-tool-sketchpad/returnModeStatic', 'Static Return Value')}
                        </option>
                        <option value='askAtRuntime'>
                            {nls.localize('theia/ai-tool-sketchpad/returnModeAskAtRuntime', 'Ask At Runtime')}
                        </option>
                    </select>
                </div>

                {tool.returnMode !== 'askAtRuntime' && (
                    <div className='ai-sketchpad-form-field'>
                        <label>{nls.localize('theia/ai-tool-sketchpad/staticReturn', 'Static Return Value')}</label>
                        <textarea
                            className='theia-input ai-sketchpad-textarea'
                            value={tool.staticReturn}
                            placeholder={nls.localize('theia/ai-tool-sketchpad/staticReturnPlaceholder',
                                'The value returned when this tool is invoked (e.g. JSON string)')}
                            onChange={e => updateField('staticReturn', e.target.value)}
                            rows={4}
                        />
                        <span className='ai-sketchpad-hint'>
                            {nls.localize('theia/ai-tool-sketchpad/staticReturnHint',
                                'This static value is returned every time the tool is called, regardless of the input arguments.')}
                        </span>
                    </div>
                )}

                {tool.returnMode === 'askAtRuntime' && (
                    <div className='ai-sketchpad-form-field'>
                        <span className='ai-sketchpad-hint'>
                            {nls.localize('theia/ai-tool-sketchpad/askAtRuntimeHint',
                                'When the LLM calls this tool, a quick input will open asking you to provide the return value.')}
                        </span>
                    </div>
                )}

                <div className='ai-sketchpad-actions'>
                    <button
                        className='theia-button main'
                        onClick={handleSave}
                        disabled={!isDirty || !tool.name.trim()}
                    >
                        {nls.localizeByDefault('Save')}
                    </button>
                    <button className='theia-button secondary' onClick={() => onDelete(tool.id)}>
                        {nls.localizeByDefault('Delete')}
                    </button>
                </div>
            </div>
        </div>
    );
}

function deepCopy<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

@injectable()
export class SketchedToolWidget extends ReactWidget {

    static readonly ID = 'ai-tool-sketchpad';
    static readonly LABEL = nls.localize('theia/ai-tool-sketchpad/label', 'Tool Sketchpad');

    @inject(SketchedToolService)
    protected readonly sketchedToolService: SketchedToolService;

    protected tools: SketchedToolDefinition[] = [];
    protected selectedToolId: string | undefined;
    protected editingTool: SketchedToolDefinition | undefined;
    protected isNewUnsavedTool = false;

    @postConstruct()
    protected init(): void {
        this.id = SketchedToolWidget.ID;
        this.title.label = SketchedToolWidget.LABEL;
        this.title.caption = SketchedToolWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = codicon('beaker');
        this.addClass('ai-sketchpad-widget');

        this.loadTools();

        this.toDispose.push(
            this.sketchedToolService.onDidChangeSketchedTools(() => {
                this.loadTools();
            })
        );
    }

    protected loadTools(): void {
        this.tools = this.sketchedToolService.getSketchedTools();
        if (this.selectedToolId) {
            const stillExists = this.tools.find(t => t.id === this.selectedToolId);
            if (!stillExists) {
                // Preserve a new tool that hasn't been saved to the service yet
                if (!this.isNewUnsavedTool) {
                    this.selectedToolId = undefined;
                    this.editingTool = undefined;
                }
            } else {
                this.isNewUnsavedTool = false;
                this.editingTool = deepCopy(stillExists);
            }
        }
        this.update();
    }

    protected render(): React.ReactNode {
        return (
            <div className='ai-sketchpad-container'>
                {this.renderList()}
                {this.renderDetail()}
            </div>
        );
    }

    protected renderList(): React.ReactNode {
        return (
            <div className='ai-sketchpad-list preferences-tree-widget theia-TreeContainer'>
                <ul>
                    {this.tools.map(tool => (
                        <ToolListItem
                            key={tool.id}
                            tool={tool}
                            isSelected={this.selectedToolId === tool.id}
                            onSelect={this.handleSelectTool}
                            onDelete={this.handleDeleteTool}
                        />
                    ))}
                </ul>
                <div className='ai-sketchpad-add-button'>
                    <button className='theia-button main' onClick={this.handleAddTool}>
                        <i className={codicon('add')} />&nbsp;
                        {nls.localize('theia/ai-tool-sketchpad/addTool', 'Add Tool')}
                    </button>
                </div>
            </div>
        );
    }

    protected renderDetail(): React.ReactNode {
        if (!this.editingTool) {
            return (
                <div className='ai-sketchpad-detail preferences-editor-widget'>
                    <div className='ai-sketchpad-empty-state'>
                        <span className='ai-sketchpad-empty-message'>
                            {nls.localize('theia/ai-tool-sketchpad/selectTool', 'Select a tool to edit or add a new one.')}
                        </span>
                    </div>
                </div>
            );
        }

        return (
            <ToolDetailForm
                key={this.editingTool.id}
                tool={this.editingTool}
                onSave={this.handleSave}
                onDelete={this.handleDeleteTool}
            />
        );
    }

    // --- Event Handlers (arrow functions per coding guidelines) ---

    protected handleSelectTool = (tool: SketchedToolDefinition): void => {
        this.selectedToolId = tool.id;
        this.editingTool = deepCopy(tool);
        this.update();
    };

    protected handleAddTool = (): void => {
        const newTool: SketchedToolDefinition = {
            id: generateUuid(),
            name: '',
            description: '',
            parameters: [],
            returnMode: 'static',
            staticReturn: ''
        };
        this.selectedToolId = newTool.id;
        this.editingTool = newTool;
        this.isNewUnsavedTool = true;
        this.update();
    };

    protected handleDeleteTool = async (toolId: string): Promise<void> => {
        if (this.selectedToolId === toolId) {
            this.selectedToolId = undefined;
            this.editingTool = undefined;
            this.isNewUnsavedTool = false;
        }
        const existing = this.tools.find(t => t.id === toolId);
        if (existing) {
            await this.sketchedToolService.removeSketchedTool(toolId);
            // loadTools() will be triggered via onDidChangeSketchedTools and call update()
        } else {
            // New unsaved tool not yet in the service — just refresh the UI
            this.update();
        }
    };

    protected handleSave = async (tool: SketchedToolDefinition): Promise<void> => {
        if (!tool.name.trim()) {
            return;
        }
        this.editingTool = tool;
        this.isNewUnsavedTool = false;
        const existing = this.tools.find(t => t.id === tool.id);
        if (existing) {
            await this.sketchedToolService.updateSketchedTool(tool);
        } else {
            await this.sketchedToolService.addSketchedTool(tool);
        }
        // loadTools() is triggered via onDidChangeSketchedTools and calls update()
    };
}
