export interface UriSelection {
    readonly uri: string
}

export namespace UriSelection {
    export function is(selection: any): selection is UriSelection {
        return !!selection && 'uri' in selection
    }
}