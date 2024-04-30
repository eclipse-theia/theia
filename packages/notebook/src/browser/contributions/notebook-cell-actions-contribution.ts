// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import { Command, CommandContribution, CommandHandler, CommandRegistry, CompoundMenuNodeRole, MenuContribution, MenuModelRegistry, nls } from '@theia/core';
import { codicon, Key, KeybindingContribution, KeybindingRegistry, KeyCode, KeyModifier } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import {
    NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_TYPE,
    NotebookContextKeys, NOTEBOOK_CELL_EXECUTING, NOTEBOOK_EDITOR_FOCUSED,
    NOTEBOOK_CELL_FOCUSED
} from './notebook-context-keys';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { NotebookExecutionService } from '../service/notebook-execution-service';
import { NotebookCellOutputModel } from '../view-model/notebook-cell-output-model';
import { CellEditType, CellKind } from '../../common';
import { NotebookEditorWidgetService } from '../service/notebook-editor-widget-service';
import { NotebookCommands } from './notebook-actions-contribution';
import { changeCellType } from './cell-operations';
import { EditorLanguageQuickPickService } from '@theia/editor/lib/browser/editor-language-quick-pick-service';

export namespace NotebookCellCommands {
    /** Parameters: notebookModel: NotebookModel | undefined, cell: NotebookCellModel */
    export const EDIT_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.edit',
        iconClass: codicon('edit')
    });
    /** Parameters: notebookModel: NotebookModel | undefined, cell: NotebookCellModel */
    export const STOP_EDIT_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.stop-edit',
        iconClass: codicon('check')
    });
    /** Parameters: notebookModel: NotebookModel, cell: NotebookCellModel */
    export const DELETE_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.delete',
        iconClass: codicon('trash')
    });
    /** Parameters: notebookModel: NotebookModel, cell: NotebookCellModel */
    export const SPLIT_CELL_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.split-cell',
        iconClass: codicon('split-vertical'),
    });
    /** Parameters: notebookModel: NotebookModel, cell: NotebookCellModel */
    export const EXECUTE_SINGLE_CELL_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.execute-cell',
        iconClass: codicon('play'),
    });
    /** Parameters: notebookModel: NotebookModel, cell: NotebookCellModel */
    export const EXECUTE_SINGLE_CELL_AND_FOCUS_NEXT_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.execute-cell-and-focus-next',
    });

    export const EXECUTE_ABOVE_CELLS_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebookActions.executeAbove',
        label: 'Execute Above Cells',
        iconClass: codicon('run-above')
    });

    export const EXECUTE_CELL_AND_BELOW_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebookActions.executeBelow',
        label: 'Execute Cell and Below',
        iconClass: codicon('run-below')
    });
    /** Parameters: notebookModel: NotebookModel, cell: NotebookCellModel */
    export const STOP_CELL_EXECUTION_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.stop-cell-execution',
        iconClass: codicon('stop'),
    });
    /** Parameters: notebookModel: NotebookModel | undefined, cell: NotebookCellModel */
    export const CLEAR_OUTPUTS_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.clear-outputs',
        label: 'Clear Cell Outputs',
    });
    /** Parameters: notebookModel: NotebookModel | undefined, cell: NotebookCellModel | undefined, output: NotebookCellOutputModel */
    export const CHANGE_OUTPUT_PRESENTATION_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.change-presentation',
        label: 'Change Presentation',
    });

    export const INSERT_NEW_CELL_ABOVE_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.insertCodeCellAboveAndFocusContainer',
        label: 'Insert Code Cell Above and Focus Container'
    });

    export const INSERT_NEW_CELL_BELOW_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.insertCodeCellBelowAndFocusContainer',
        label: 'Insert Code Cell Below and Focus Container'
    });

    export const INSERT_MARKDOWN_CELL_ABOVE_COMMAND = Command.toLocalizedCommand({
        id: 'notebook.cell.insertMarkdownCellAbove',
        label: 'Insert Markdown Cell Above'
    });
    export const INSERT_MARKDOWN_CELL_BELOW_COMMAND = Command.toLocalizedCommand({
        id: 'notebook.cell.insertMarkdownCellBelow',
        label: 'Insert Markdown Cell Below'
    });

    export const TO_CODE_CELL_COMMAND = Command.toLocalizedCommand({
        id: 'notebook.cell.changeToCode',
        label: 'Change Cell to Code'
    });

    export const TO_MARKDOWN_CELL_COMMAND = Command.toLocalizedCommand({
        id: 'notebook.cell.changeToMarkdown',
        label: 'Change Cell to Mardown'
    });

    export const TOGGLE_CELL_OUTPUT = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.toggleOutputs',
        category: 'Notebook',
        label: 'Collapse Cell Output',
    });

    export const CHANGE_CELL_LANGUAGE = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.changeLanguage',
        category: 'Notebook',
        label: 'Change Cell Language',
    });

    export const TOGGLE_LINE_NUMBERS = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.toggleLineNumbers',
        category: 'Notebook',
        label: 'Show Cell Line Numbers',
    });

}

@injectable()
export class NotebookCellActionContribution implements MenuContribution, CommandContribution, KeybindingContribution {

    @inject(ContextKeyService)
    protected contextKeyService: ContextKeyService;

    @inject(NotebookExecutionService)
    protected notebookExecutionService: NotebookExecutionService;

    @inject(NotebookEditorWidgetService)
    protected notebookEditorWidgetService: NotebookEditorWidgetService;

    @inject(EditorLanguageQuickPickService)
    protected languageQuickPickService: EditorLanguageQuickPickService;

    @postConstruct()
    protected init(): void {
        NotebookContextKeys.initNotebookContextKeys(this.contextKeyService);
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(NotebookCellActionContribution.ACTION_MENU, {
            commandId: NotebookCellCommands.EDIT_COMMAND.id,
            icon: NotebookCellCommands.EDIT_COMMAND.iconClass,
            when: `${NOTEBOOK_CELL_TYPE} == 'markdown' && !${NOTEBOOK_CELL_MARKDOWN_EDIT_MODE}`,
            label: nls.localizeByDefault('Edit Cell'),
            order: '10'
        });
        menus.registerMenuAction(NotebookCellActionContribution.ACTION_MENU, {
            commandId: NotebookCellCommands.STOP_EDIT_COMMAND.id,
            icon: NotebookCellCommands.STOP_EDIT_COMMAND.iconClass,
            when: `${NOTEBOOK_CELL_TYPE} == 'markdown' && ${NOTEBOOK_CELL_MARKDOWN_EDIT_MODE}`,
            label: nls.localizeByDefault('Stop Editing Cell'),
            order: '10'
        });

        menus.registerMenuAction(NotebookCellActionContribution.ACTION_MENU, {
            commandId: NotebookCellCommands.EXECUTE_ABOVE_CELLS_COMMAND.id,
            icon: NotebookCellCommands.EXECUTE_ABOVE_CELLS_COMMAND.iconClass,
            when: `${NOTEBOOK_CELL_TYPE} == 'code'`,
            label: nls.localizeByDefault('Execute Above Cells'),
            order: '10'
        });

        menus.registerMenuAction(NotebookCellActionContribution.ACTION_MENU, {
            commandId: NotebookCellCommands.EXECUTE_CELL_AND_BELOW_COMMAND.id,
            icon: NotebookCellCommands.EXECUTE_CELL_AND_BELOW_COMMAND.iconClass,
            when: `${NOTEBOOK_CELL_TYPE} == 'code'`,
            label: nls.localizeByDefault('Execute Cell and Below'),
            order: '20'
        });

        // menus.registerMenuAction(NotebookCellActionContribution.ACTION_MENU, {
        //     commandId: NotebookCellCommands.SPLIT_CELL_COMMAND.id,
        //     icon: NotebookCellCommands.SPLIT_CELL_COMMAND.iconClass,
        //     label: nls.localizeByDefault('Split Cell'),
        //     order: '20'
        // });

        menus.registerMenuAction(NotebookCellActionContribution.ACTION_MENU, {
            commandId: NotebookCellCommands.DELETE_COMMAND.id,
            icon: NotebookCellCommands.DELETE_COMMAND.iconClass,
            label: nls.localizeByDefault('Delete Cell'),
            order: '999'
        });

        menus.registerSubmenu(
            NotebookCellActionContribution.ADDITIONAL_ACTION_MENU,
            nls.localizeByDefault('More'),
            {
                icon: codicon('ellipsis'),
                role: CompoundMenuNodeRole.Submenu,
                order: '30'
            }
        );

        menus.registerIndependentSubmenu(NotebookCellActionContribution.CONTRIBUTED_CELL_ACTION_MENU, '', { role: CompoundMenuNodeRole.Flat });
        // since contributions are adding to an independent submenu we have to manually add it to the more submenu
        menus.getMenu(NotebookCellActionContribution.ADDITIONAL_ACTION_MENU).addNode(menus.getMenuNode(NotebookCellActionContribution.CONTRIBUTED_CELL_ACTION_MENU));

        // code cell sidebar menu
        menus.registerMenuAction(NotebookCellActionContribution.CODE_CELL_SIDEBAR_MENU, {
            commandId: NotebookCellCommands.EXECUTE_SINGLE_CELL_COMMAND.id,
            icon: NotebookCellCommands.EXECUTE_SINGLE_CELL_COMMAND.iconClass,
            label: nls.localizeByDefault('Execute Cell'),
            when: `!${NOTEBOOK_CELL_EXECUTING}`
        });
        menus.registerMenuAction(NotebookCellActionContribution.CODE_CELL_SIDEBAR_MENU, {
            commandId: NotebookCellCommands.STOP_CELL_EXECUTION_COMMAND.id,
            icon: NotebookCellCommands.STOP_CELL_EXECUTION_COMMAND.iconClass,
            label: nls.localizeByDefault('Stop Cell Execution'),
            when: NOTEBOOK_CELL_EXECUTING
        });

        // Notebook Cell extra execution options
        menus.registerIndependentSubmenu(NotebookCellActionContribution.CONTRIBUTED_CELL_EXECUTION_MENU,
            nls.localizeByDefault('More...'),
            { role: CompoundMenuNodeRole.Flat, icon: codicon('chevron-down') });
        // menus.getMenu(NotebookCellActionContribution.CODE_CELL_SIDEBAR_MENU).addNode(menus.getMenuNode(NotebookCellActionContribution.CONTRIBUTED_CELL_EXECUTION_MENU));

        // code cell output sidebar menu
        menus.registerSubmenu(
            NotebookCellActionContribution.ADDITIONAL_OUTPUT_SIDEBAR_MENU,
            nls.localizeByDefault('More'),
            {
                icon: codicon('ellipsis'),
                role: CompoundMenuNodeRole.Submenu
            });
        menus.registerMenuAction(NotebookCellActionContribution.ADDITIONAL_OUTPUT_SIDEBAR_MENU, {
            commandId: NotebookCellCommands.CLEAR_OUTPUTS_COMMAND.id,
            label: nls.localizeByDefault('Clear Cell Outputs'),
        });
        menus.registerMenuAction(NotebookCellActionContribution.ADDITIONAL_OUTPUT_SIDEBAR_MENU, {
            commandId: NotebookCellCommands.CHANGE_OUTPUT_PRESENTATION_COMMAND.id,
            label: nls.localizeByDefault('Change Presentation'),
        });

    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(NotebookCellCommands.EDIT_COMMAND, this.editableCellCommandHandler((_, cell) => cell.requestFocusEditor()));
        commands.registerCommand(NotebookCellCommands.STOP_EDIT_COMMAND, { execute: (_, cell: NotebookCellModel) => (cell ?? this.getSelectedCell()).requestBlurEditor() });
        commands.registerCommand(NotebookCellCommands.DELETE_COMMAND,
            this.editableCellCommandHandler((notebookModel, cell) => {
                notebookModel.applyEdits([{
                    editType: CellEditType.Replace,
                    index: notebookModel.cells.indexOf(cell),
                    count: 1,
                    cells: []
                }]
                    , true);
            }));
        commands.registerCommand(NotebookCellCommands.SPLIT_CELL_COMMAND);

        commands.registerCommand(NotebookCellCommands.EXECUTE_SINGLE_CELL_COMMAND, this.editableCellCommandHandler(
            (notebookModel, cell) => {
                this.notebookExecutionService.executeNotebookCells(notebookModel, [cell]);
            })
        );

        commands.registerCommand(NotebookCellCommands.EXECUTE_SINGLE_CELL_AND_FOCUS_NEXT_COMMAND, this.editableCellCommandHandler(
            (notebookModel, cell) => {
                if (cell.cellKind === CellKind.Code) {
                    commands.executeCommand(NotebookCellCommands.EXECUTE_SINGLE_CELL_COMMAND.id, notebookModel, cell);
                } else {
                    commands.executeCommand(NotebookCellCommands.STOP_EDIT_COMMAND.id, notebookModel, cell);
                }
                const index = notebookModel.cells.indexOf(cell);
                if (index < notebookModel.cells.length - 1) {
                    notebookModel.setSelectedCell(notebookModel.cells[index + 1]);
                } else if (cell.cellKind === CellKind.Code) {
                    commands.executeCommand(NotebookCellCommands.INSERT_NEW_CELL_BELOW_COMMAND.id);
                } else {
                    commands.executeCommand(NotebookCellCommands.INSERT_MARKDOWN_CELL_BELOW_COMMAND.id);
                }
            })
        );

        commands.registerCommand(NotebookCellCommands.EXECUTE_ABOVE_CELLS_COMMAND, this.editableCellCommandHandler(
            (notebookModel, cell) => {
                const index = notebookModel.cells.indexOf(cell);
                if (index > 0) {
                    this.notebookExecutionService.executeNotebookCells(notebookModel, notebookModel.cells.slice(0, index).filter(c => c.cellKind === CellKind.Code));
                }
            })
        );

        commands.registerCommand(NotebookCellCommands.EXECUTE_CELL_AND_BELOW_COMMAND, this.editableCellCommandHandler(
            (notebookModel, cell) => {
                const index = notebookModel.cells.indexOf(cell);
                if (index < notebookModel.cells.length - 1) {
                    this.notebookExecutionService.executeNotebookCells(notebookModel, notebookModel.cells.slice(index).filter(c => c.cellKind === CellKind.Code));
                }
            })
        );

        commands.registerCommand(NotebookCellCommands.STOP_CELL_EXECUTION_COMMAND, {
            execute: (notebookModel: NotebookModel, cell: NotebookCellModel) => {
                notebookModel = notebookModel ?? this.notebookEditorWidgetService.focusedEditor?.model;
                cell = cell ?? this.getSelectedCell();
                this.notebookExecutionService.cancelNotebookCells(notebookModel, [cell]);
            }
        });
        commands.registerCommand(NotebookCellCommands.CLEAR_OUTPUTS_COMMAND, this.editableCellCommandHandler(
            (notebook, cell) => (notebook ?? this.notebookEditorWidgetService.focusedEditor?.model)?.applyEdits([{
                editType: CellEditType.Output,
                handle: cell.handle,
                outputs: [],
                deleteCount: cell.outputs.length,
                append: false
            }], true)
        ));
        commands.registerCommand(NotebookCellCommands.CHANGE_OUTPUT_PRESENTATION_COMMAND, this.editableCellCommandHandler(
            (_, __, output) => output?.requestOutputPresentationUpdate()
        ));

        const insertCommand = (type: CellKind, index: number | 'above' | 'below'): CommandHandler => this.editableCellCommandHandler(() =>
            commands.executeCommand(NotebookCommands.ADD_NEW_CELL_COMMAND.id, undefined, type, index)
        );
        commands.registerCommand(NotebookCellCommands.INSERT_NEW_CELL_ABOVE_COMMAND, insertCommand(CellKind.Code, 'above'));
        commands.registerCommand(NotebookCellCommands.INSERT_NEW_CELL_BELOW_COMMAND, insertCommand(CellKind.Code, 'below'));
        commands.registerCommand(NotebookCellCommands.INSERT_MARKDOWN_CELL_ABOVE_COMMAND, insertCommand(CellKind.Markup, 'above'));
        commands.registerCommand(NotebookCellCommands.INSERT_MARKDOWN_CELL_BELOW_COMMAND, insertCommand(CellKind.Markup, 'below'));

        commands.registerCommand(NotebookCellCommands.TO_CODE_CELL_COMMAND, this.editableCellCommandHandler((notebookModel, cell) => {
            changeCellType(notebookModel, cell, CellKind.Code);
        }));
        commands.registerCommand(NotebookCellCommands.TO_MARKDOWN_CELL_COMMAND, this.editableCellCommandHandler((notebookModel, cell) => {
            changeCellType(notebookModel, cell, CellKind.Markup);
        }));

        commands.registerCommand(NotebookCellCommands.TOGGLE_CELL_OUTPUT, {
            execute: () => {
                const selectedCell = this.notebookEditorWidgetService.focusedEditor?.model?.selectedCell;
                if (selectedCell) {
                    selectedCell.outputVisible = !selectedCell.outputVisible;
                }
            }
        });

        commands.registerCommand(NotebookCellCommands.CHANGE_CELL_LANGUAGE, {
            isVisible: () => !!this.notebookEditorWidgetService.focusedEditor?.model?.selectedCell,
            execute: async (notebook?: NotebookModel, cell?: NotebookCellModel) => {
                const selectedCell = cell ?? this.notebookEditorWidgetService.focusedEditor?.model?.selectedCell;
                const activeNotebook = notebook ?? this.notebookEditorWidgetService.focusedEditor?.model;
                if (selectedCell && activeNotebook) {
                    const language = await this.languageQuickPickService.pickEditorLanguage(selectedCell.language);
                    if (language?.value && language.value !== 'autoDetect') {
                        this.notebookEditorWidgetService.focusedEditor?.model?.applyEdits([{
                            editType: CellEditType.CellLanguage,
                            index: activeNotebook.cells.indexOf(selectedCell),
                            language: language.value.id
                        }], true);
                    }
                }
            }
        });

        commands.registerCommand(NotebookCellCommands.TOGGLE_LINE_NUMBERS, {
            execute: () => {
                const selectedCell = this.notebookEditorWidgetService.focusedEditor?.model?.selectedCell;
                if (selectedCell) {
                    const currentLineNumber = selectedCell.editorOptions?.lineNumbers;
                    selectedCell.editorOptions = { ...selectedCell.editorOptions, lineNumbers: !currentLineNumber || currentLineNumber === 'off' ? 'on' : 'off' };
                }
            }
        });

    }

    protected editableCellCommandHandler(execute: (notebookModel: NotebookModel, cell: NotebookCellModel, output?: NotebookCellOutputModel) => void): CommandHandler {
        return {
            isEnabled: (notebookModel: NotebookModel) => !Boolean(notebookModel?.readOnly),
            isVisible: (notebookModel: NotebookModel) => !Boolean(notebookModel?.readOnly),
            execute: (notebookModel: NotebookModel, cell: NotebookCellModel, output?: NotebookCellOutputModel) => {
                notebookModel = notebookModel ?? this.notebookEditorWidgetService.focusedEditor?.model;
                cell = cell ?? this.getSelectedCell();
                execute(notebookModel, cell, output);
            }
        };
    }

    protected getSelectedCell(): NotebookCellModel | undefined {
        return this.notebookEditorWidgetService.focusedEditor?.model?.selectedCell;
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybindings(
            {
                command: NotebookCellCommands.EDIT_COMMAND.id,
                keybinding: 'Enter',
                when: `!editorTextFocus && ${NOTEBOOK_EDITOR_FOCUSED} && ${NOTEBOOK_CELL_FOCUSED}`,
            },
            {
                command: NotebookCellCommands.STOP_EDIT_COMMAND.id,
                keybinding: KeyCode.createKeyCode({ first: Key.ENTER, modifiers: [KeyModifier.Alt] }).toString(),
                when: `editorTextFocus && ${NOTEBOOK_EDITOR_FOCUSED}`,
            },
            {
                command: NotebookCellCommands.STOP_EDIT_COMMAND.id,
                keybinding: 'esc',
                when: `editorTextFocus && ${NOTEBOOK_EDITOR_FOCUSED}`,
            },
            {
                command: NotebookCellCommands.EXECUTE_SINGLE_CELL_COMMAND.id,
                keybinding: KeyCode.createKeyCode({ first: Key.ENTER, modifiers: [KeyModifier.CtrlCmd] }).toString(),
                when: `${NOTEBOOK_EDITOR_FOCUSED} && ${NOTEBOOK_CELL_FOCUSED} && ${NOTEBOOK_CELL_TYPE} == 'code'`,
            },
            {
                command: NotebookCellCommands.EXECUTE_SINGLE_CELL_AND_FOCUS_NEXT_COMMAND.id,
                keybinding: KeyCode.createKeyCode({ first: Key.ENTER, modifiers: [KeyModifier.Shift] }).toString(),
                when: `${NOTEBOOK_EDITOR_FOCUSED} && ${NOTEBOOK_CELL_FOCUSED}`,
            },
            {
                command: NotebookCellCommands.CLEAR_OUTPUTS_COMMAND.id,
                keybinding: KeyCode.createKeyCode({ first: Key.KEY_O, modifiers: [KeyModifier.Alt] }).toString(),
                when: `${NOTEBOOK_EDITOR_FOCUSED} && ${NOTEBOOK_CELL_FOCUSED} && ${NOTEBOOK_CELL_TYPE} == 'code'`,
            },
            {
                command: NotebookCellCommands.CHANGE_OUTPUT_PRESENTATION_COMMAND.id,
                keybinding: KeyCode.createKeyCode({ first: Key.KEY_P, modifiers: [KeyModifier.Alt] }).toString(),
                when: `${NOTEBOOK_EDITOR_FOCUSED} && ${NOTEBOOK_CELL_FOCUSED} && ${NOTEBOOK_CELL_TYPE} == 'code'`,
            },
            {
                command: NotebookCellCommands.TO_CODE_CELL_COMMAND.id,
                keybinding: 'Y',
                when: `!editorTextFocus && ${NOTEBOOK_EDITOR_FOCUSED} && ${NOTEBOOK_CELL_FOCUSED} && ${NOTEBOOK_CELL_TYPE} == 'markdown'`,
            },
            {
                command: NotebookCellCommands.TO_MARKDOWN_CELL_COMMAND.id,
                keybinding: 'M',
                when: `!editorTextFocus && ${NOTEBOOK_EDITOR_FOCUSED} && ${NOTEBOOK_CELL_FOCUSED} && ${NOTEBOOK_CELL_TYPE} == 'code'`,
            },
        );
    }
}

export namespace NotebookCellActionContribution {
    export const ACTION_MENU = ['notebook-cell-actions-menu'];
    export const ADDITIONAL_ACTION_MENU = [...ACTION_MENU, 'more'];
    export const CONTRIBUTED_CELL_ACTION_MENU = 'notebook/cell/title';
    export const CONTRIBUTED_CELL_EXECUTION_MENU = 'notebook/cell/execute';
    export const CODE_CELL_SIDEBAR_MENU = ['code-cell-sidebar-menu'];
    export const OUTPUT_SIDEBAR_MENU = ['code-cell-output-sidebar-menu'];
    export const ADDITIONAL_OUTPUT_SIDEBAR_MENU = [...OUTPUT_SIDEBAR_MENU, 'more'];

}

