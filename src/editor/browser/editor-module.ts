import { isFirefox, isIE, isWebKit } from '../../application/browser'
import { isOSX } from '../../application/common/os';
import { IOpenerService, TheiaPlugin } from '../../application/browser';
import { SelectionService } from '../../application/common/selection-service';
import { CommandContribution, CommandRegistry, CommandHandler } from '../../application/common/command';
import { CommonCommands } from '../../application/common/commands-common';
import { MenuContribution, MenuModelRegistry } from '../../application/common/menu';
import { EditorCommandHandler, TextModificationEditorCommandHandler } from './editor-command';
import { EditorManager, IEditorManager } from './editor-manager';
import { EditorRegistry } from './editor-registry';
import { EditorService } from './editor-service';
import { TextModelResolverService } from './model-resolver-service';
import { EditorWidget } from './editor-widget';
import { ContainerModule, inject, injectable } from 'inversify';
import { Keybinding, KeybindingContext, KeybindingContribution, } from '../../application/common/keybinding';
import { Accelerator, Key, KeyCode, KeySequence, Modifier } from '../../application/common/keys';
import { BrowserContextMenuService, EditorContextMenuService, EDITOR_CONTEXT_MENU_ID } from './editor-contextmenu';
import CommandsRegistry = monaco.commands.CommandsRegistry;
import MenuRegistry = monaco.actions.MenuRegistry;
import MenuId = monaco.actions.MenuId;
import ICommand = monaco.commands.ICommand;
import IMenuItem = monaco.actions.IMenuItem;
import KeybindingsRegistry = monaco.keybindings.KeybindingsRegistry;
import KeyCodeUtils = monaco.keybindings.KeyCodeUtils;
import IKeybindingItem = monaco.keybindings.IKeybindingItem;
import KeyMod = monaco.KeyMod;

const MONACO_KEY_CODE_MAP: { [keyCode: number]: number } = {};
(() => {
    MONACO_KEY_CODE_MAP[monaco.KeyCode.PauseBreak] = 3; // VK_CANCEL 0x03 Control-break processing
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Backspace] = 8;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Tab] = 9;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Enter] = 13;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Shift] = 16;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Ctrl] = 17;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Alt] = 18;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.PauseBreak] = 19;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.CapsLock] = 20;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Escape] = 27;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Space] = 32;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.PageUp] = 33;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.PageDown] = 34;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.End] = 35;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Home] = 36;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.LeftArrow] = 37;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.UpArrow] = 38;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.RightArrow] = 39;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.DownArrow] = 40;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Insert] = 45;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.Delete] = 46;

    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_0] = 48;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_1] = 49;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_2] = 50;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_3] = 51;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_4] = 52;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_5] = 53;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_6] = 54;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_7] = 55;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_8] = 56;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_9] = 57;

    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_A] = 65;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_B] = 66;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_C] = 67;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_D] = 68;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_E] = 69;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_F] = 70;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_G] = 71;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_H] = 72;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_I] = 73;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_J] = 74;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_K] = 75;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_L] = 76;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_M] = 77;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_N] = 78;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_O] = 79;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_P] = 80;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_Q] = 81;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_R] = 82;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_S] = 83;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_T] = 84;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_U] = 85;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_V] = 86;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_W] = 87;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_X] = 88;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_Y] = 89;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.KEY_Z] = 90;

    MONACO_KEY_CODE_MAP[monaco.KeyCode.ContextMenu] = 93;

    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_0] = 96;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_1] = 97;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_2] = 98;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_3] = 99;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_4] = 100;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_5] = 101;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_6] = 102;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_7] = 103;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_8] = 104;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_9] = 105;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_MULTIPLY] = 106;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_ADD] = 107;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_SEPARATOR] = 108;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_SUBTRACT] = 109;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_DECIMAL] = 110;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.NUMPAD_DIVIDE] = 111;

    MONACO_KEY_CODE_MAP[monaco.KeyCode.F1] = 112;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F2] = 113;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F3] = 114;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F4] = 115;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F5] = 116;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F6] = 117;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F7] = 118;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F8] = 119;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F9] = 120;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F10] = 121;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F11] = 122;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F12] = 123;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F13] = 124;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F14] = 125;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F15] = 126;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F16] = 127;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F17] = 128;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F18] = 129;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.F19] = 130;

    MONACO_KEY_CODE_MAP[monaco.KeyCode.NumLock] = 144;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.ScrollLock] = 145;

    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_SEMICOLON] = 186;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_EQUAL] = 187;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_COMMA] = 188;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_MINUS] = 189;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_DOT] = 190;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_SLASH] = 191;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_BACKTICK] = 192;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_OPEN_SQUARE_BRACKET] = 219;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_BACKSLASH] = 220;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_CLOSE_SQUARE_BRACKET] = 221;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.US_QUOTE] = 222;
    MONACO_KEY_CODE_MAP[monaco.KeyCode.OEM_8] = 223;

    MONACO_KEY_CODE_MAP[monaco.KeyCode.OEM_102] = 226;

    if (isIE) {
        MONACO_KEY_CODE_MAP[monaco.KeyCode.Meta] = 91;
    } else if (isFirefox) {
        MONACO_KEY_CODE_MAP[monaco.KeyCode.US_SEMICOLON] = 59;
        MONACO_KEY_CODE_MAP[monaco.KeyCode.US_EQUAL] = 107;
        MONACO_KEY_CODE_MAP[monaco.KeyCode.US_MINUS] = 109;
        if (isOSX) {
            MONACO_KEY_CODE_MAP[monaco.KeyCode.Meta] = 224;
        }
    } else if (isWebKit) {
        MONACO_KEY_CODE_MAP[monaco.KeyCode.Meta] = 91;
        if (isOSX) {
            // the two meta keys in the Mac have different key codes (91 and 93)
            MONACO_KEY_CODE_MAP[monaco.KeyCode.Meta] = 93;
        } else {
            MONACO_KEY_CODE_MAP[monaco.KeyCode.Meta] = 92;
        }
    }
})();

@injectable()
class EditorCommandHandlers implements CommandContribution {

    constructor(
        @inject(IEditorManager) private editorService: IEditorManager,
        @inject(SelectionService) private selectionService: SelectionService) {

    }

    contribute(registry: CommandRegistry) {

        [CommonCommands.EDIT_UNDO, CommonCommands.EDIT_REDO].forEach(id => {
            const doExecute = (editorWidget: EditorWidget, ...args: any[]): any => {
                return editorWidget.getControl().trigger('keyboard', id, args);
            };
            const handler = this.newClipboardHandler(id, doExecute);
            registry.registerHandler(id, handler);
        });

        MenuRegistry.getMenuItems(MenuId.EditorContext).map(item => item.command).forEach(command => {
            registry.registerCommand({
                id: command.id,
                label: command.title,
                iconClass: command.iconClass
            });
        });

        const findCommand: (item: IMenuItem) => ICommand = (item) => CommandsRegistry.getCommand(item.command.id);
        const wrap: (item: IMenuItem, command: ICommand) => { item: IMenuItem, command: ICommand } = (item, command) => {
            return { item, command }
        }

        MenuRegistry.getMenuItems(MenuId.EditorContext).map(item => wrap(item, findCommand(item))).forEach(props => {
            const id = props.item.command.id;
            registry.registerHandler(
                id,
                this.newHandler(id)
            );
        });

        registry.registerCommand({
            id: 'editor.close',
            label: 'Close Active Editor'
        });
        registry.registerHandler('editor.close', {
            execute: (arg?: any): any => {
                const editor = this.editorService.activeEditor;
                if (editor) {
                    editor.close();
                }
                return null;
            },
            isEnabled: Enabled => { return true; }
        });

        registry.registerCommand({
            id: 'editor.close.all',
            label: 'Close All Editors'
        });
        registry.registerHandler('editor.close.all', {
            execute: (arg?: any): any => {
                this.editorService.editors.forEach(editor => {
                    editor.close();
                });
                return null;
            },
            isEnabled: Enabled => { return true; }
        });

    }

    private newHandler(id: string): CommandHandler {
        return new EditorCommandHandler(this.editorService, this.selectionService, id);
    }

    private newClipboardHandler(id: string, doExecute: (editorWidget: EditorWidget, ...args: any[]) => any) {
        const commandArgs = (widget: EditorWidget) => [{}];
        return new TextModificationEditorCommandHandler(this.editorService, this.selectionService, id, commandArgs, doExecute);
    }

}

@injectable()
class EditorMenuContribution implements MenuContribution {
    contribute(registry: MenuModelRegistry) {
        // Explicitly register the Edit Submenu
        registry.registerMenuAction([EDITOR_CONTEXT_MENU_ID, "1_undo/redo"], {
            commandId: CommonCommands.EDIT_UNDO
        });
        registry.registerMenuAction([EDITOR_CONTEXT_MENU_ID, "1_undo/redo"], {
            commandId: CommonCommands.EDIT_REDO
        });

        const wrap: (item: IMenuItem) => { path: string[], commandId: string } = (item) => {
            return { path: [EDITOR_CONTEXT_MENU_ID, (item.group || "")], commandId: item.command.id };
        };

        MenuRegistry.getMenuItems(MenuId.EditorContext)
            .map(item => wrap(item))
            .forEach(props => registry.registerMenuAction(props.path, { commandId: props.commandId }));
    }
}

@injectable()
class EditorKeybindingContext extends KeybindingContext {

    static ID = 'editor.keybinding.context';

    constructor( @inject(IEditorManager) private editorService: IEditorManager) {
        super(EditorKeybindingContext.ID, () => {
            return this.editorService && !!this.editorService.activeEditor;
        })
    }

}

@injectable()
class EditorKeybindingContribution implements KeybindingContribution {

    constructor( @inject(EditorKeybindingContext) private editorKeybindingContext: EditorKeybindingContext) {

    }

    getKeybindings(): Keybinding[] {

        const ids = MenuRegistry.getMenuItems(MenuId.EditorContext).map(item => item.command.id);
        const accelerator = (kb: IKeybindingItem): Accelerator => {
            const keyCode = kb.keybinding;
            let keys: string[] = [];
            if (keyCode & KeyMod.WinCtrl) {
                keys.push('Accel');
            }
            if (keyCode & KeyMod.Alt) {
                keys.push('Alt');
            }
            if (keyCode & KeyMod.CtrlCmd) {
                keys.push('Accel');
            }
            if (keyCode & KeyMod.Shift) {
                keys.push('Shift');
            }
            keys.push(KeyCodeUtils.toString(keyCode & 255));
            return [keys.join(' ')];
        }

        const keyCode = (kb: IKeybindingItem): KeyCode => {
            const keyCode = kb.keybinding;
            const sequence: KeySequence = {
                first: Key.getKey(MONACO_KEY_CODE_MAP[kb.keybinding & 255])
            }
            const modifiers: Modifier[] = [];
            // CTRL + COMMAND
            if ((isOSX && keyCode & KeyMod.CtrlCmd) || keyCode & KeyMod.WinCtrl) {
                modifiers.push(Modifier.M1);
            }
            // SHIFT
            if (keyCode & KeyMod.Shift) {
                modifiers.push(Modifier.M2);
            }
            // ALT
            if (keyCode & KeyMod.Alt) {
                modifiers.push(Modifier.M3);
            }
            // MacOS X CTRL
            if (isOSX && keyCode & KeyMod.WinCtrl) {
                modifiers.push(Modifier.M4);
            }

            const props = ['firstModifier', 'secondModifier', 'thirdModifier'].slice(0, modifiers.length);
            for (let i = 0; i < props.length; i++) {
                Reflect.set(sequence, props[i], modifiers[i]);
            }

            return KeyCode.createKeyCode(sequence);
        }

        const bindings: Keybinding[] = KeybindingsRegistry.getDefaultKeybindings()
            .filter(kb => ids.indexOf(kb.command) >= 0)
            .map(kb => {
                return {
                    commandId: kb.command,
                    keyCode: keyCode(kb),
                    accelerator: accelerator(kb),
                }
            });

        bindings.push({
            commandId: 'editor.close',
            context: this.editorKeybindingContext,
            keyCode: KeyCode.createKeyCode({ first: Key.KEY_W, firstModifier: Modifier.M3 })
        });

        bindings.push({
            commandId: 'editor.close.all',
            context: this.editorKeybindingContext,
            keyCode: KeyCode.createKeyCode({ first: Key.KEY_W, firstModifier: Modifier.M2, secondModifier: Modifier.M3 })
        });

        return bindings;

    }

}

export const editorModule = new ContainerModule(bind => {
    bind(EditorRegistry).toSelf().inSingletonScope();
    bind<EditorContextMenuService>(EditorContextMenuService).to(BrowserContextMenuService).inSingletonScope();
    bind(EditorService).toSelf().inSingletonScope();
    bind(TextModelResolverService).toSelf().inSingletonScope();
    bind(IEditorManager).to(EditorManager).inSingletonScope();
    bind(TheiaPlugin).toDynamicValue(context => context.container.get(IEditorManager));
    bind(IOpenerService).toDynamicValue(context => context.container.get(IEditorManager));
    bind<CommandContribution>(CommandContribution).to(EditorCommandHandlers);
    bind<MenuContribution>(MenuContribution).to(EditorMenuContribution);
    bind<KeybindingContribution>(KeybindingContribution).to(EditorKeybindingContribution);
    bind<KeybindingContext>(EditorKeybindingContext).toSelf();
    bind<KeybindingContext>(KeybindingContext).to(EditorKeybindingContext);
});
