/// <reference path='../../node_modules/monaco-editor-core/monaco.d.ts'/>

declare module monaco.editor {

    export interface IEditorOverrideServices {
        editorService?: IEditorService;
        textModelResolverService?: ITextModelResolverService;
        contextMenuService?: IContextMenuService;
    }

    export interface IResourceInput {
        resource: monaco.Uri;
        options?: IResourceInputOptions;
    }

    export interface IResourceInputOptions {
        /**
         * Tells the editor to not receive keyboard focus when the editor is being opened. By default,
         * the editor will receive keyboard focus on open.
         */
        preserveFocus?: boolean;

        /**
         * Will reveal the editor if it is already opened and visible in any of the opened editor groups.
         */
        revealIfVisible?: boolean;

        /**
         * Text editor selection.
         */
        selection?: Partial<monaco.IRange>;
    }

    export interface IEditorReference {
        getControl(): monaco.editor.ICommonCodeEditor;
    }

    export interface IEditorInput {
    }

    export interface IEditorOptions {
    }

    export interface IEditorService {
        openEditor(input: IResourceInput, sideBySide?: boolean): monaco.Promise<IEditorReference | undefined>;

    }

    export interface IReference<T> extends monaco.IDisposable {
        readonly object: T;
    }

    export interface ITextModelResolverService {
        /**
         * Provided a resource URI, it will return a model reference
         * which should be disposed once not needed anymore.
         */
        createModelReference(resource: monaco.Uri): monaco.Promise<IReference<ITextEditorModel>>;

        /**
         * Registers a specific `scheme` content provider.
         */
        registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): monaco.IDisposable;
    }

    export interface ITextModelContentProvider {
        /**
         * Given a resource, return the content of the resource as IModel.
         */
        provideTextContent(resource: monaco.Uri): monaco.Promise<monaco.editor.IModel>;
    }

    export interface IEditorModel {
        onDispose: monaco.IEvent<void>;
        /**
         * Loads the model.
         */
        load(): monaco.Promise<IEditorModel>;

        /**
         * Dispose associated resources
         */
        dispose(): void;
    }


    export interface ITextEditorModel extends IEditorModel {
        /**
         * Provides access to the underlying IModel.
         */
        textEditorModel: monaco.editor.IModel;
    }

    export interface IContextMenuService {
        /**
         * Shows the native Monaco context menu in the editor.
         */
        showContextMenu(delegate: any): void;
    }

}

declare module monaco.commands {

    /**
     * Identifies a service of type T
     */
    export interface ServiceIdentifier<T> {
        (...args: any[]): void;
        type: T;
    }

    export interface ServicesAccessor {
        get<T>(id: ServiceIdentifier<T>, isOptional?: any): T;
    }

    export interface ICommandHandler {
        (accessor: ServicesAccessor, ...args: any[]): void;
    }

    export interface ICommand {
        handler: ICommandHandler;
        description?: ICommandHandlerDescription;
    }

    export interface ICommandHandlerDescription {
        description: string;
        args: { name: string; description?: string; constraint?: string | Function; }[];
        returns?: string;
    }

    export interface ICommandsMap {
        /**
         * A read only mapping from command IDs to the commands. 
         */
        readonly [id: string]: ICommand;
    }

    export interface ICommandRegistry {
        /**
         * Returns with the command for the given command ID argument.
         */
        getCommand(id: string): ICommand;

        /**
         * Returns with a mapping of all registered command IDs to the commands.
         */
        getCommands(): ICommandsMap;
    }

    /**
     * The shared command registry instance.
     */
    export const CommandsRegistry: ICommandRegistry;

}

declare module monaco.actions {

    export class MenuId {

        public static readonly EditorContext: MenuId;
    }

    export interface ILocalizedString {
        value: string;
        original: string;
    }

    export interface ICommandAction {
        id: string;
        title: string | ILocalizedString;
        category?: string | ILocalizedString;
        iconClass?: string;
    }

    export interface IMenuItem {
        command: ICommandAction;
        alt?: ICommandAction;
        when?: any;
        group?: 'navigation' | string;
        order?: number;
    }

    export interface IMenuRegistry {
        getCommand(id: string): ICommandAction;
        getMenuItems(loc: MenuId): IMenuItem[];
    }

    export const MenuRegistry: IMenuRegistry;

}