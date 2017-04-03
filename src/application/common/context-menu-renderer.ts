export const ContextMenuRenderer = Symbol("ContextMenuRenderer");

export interface ContextMenuRenderer {
    render(path: string, position: any): void; 
}