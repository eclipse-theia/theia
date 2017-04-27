import Uri from 'vscode-uri';

export default class URI {

    private uri: string;

    constructor(uri: string) {
        if (!uri) {
            throw new Error(`The \'path\' argument should be specified.`);
        }
        this.uri = Uri.parse(uri).toString();
    }

    parent(): URI {
        return new URI(this.uri.substring(0, this.uri.lastIndexOf('/')));
    }

    lastSegment(): string {
        // TODO trim queries and fragments
        return this.uri.substr(this.uri.lastIndexOf('/') + 1);
    }

    append(...segments: string[]) {
        if (!segments || segments.length === 0) {
            return this;
        }
        const copy = segments.slice(0);
        copy.unshift(this.uri);
        return new URI(copy.join('/'));
    }

    path(): string {
        return Uri.parse(this.uri).path;
    }

    toString() {
        return this.uri;
    }

}