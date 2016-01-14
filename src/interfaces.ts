import File = require("vinyl");

export interface Dictionary<T> {
    [name: string]: T;
}

export interface ArgumentOptions {
    package?: string;

    verbose?: boolean;
}

export interface PackageDescriptor {
    name?: string;

    dependencies?: Dictionary<string>;

    devDependencies?: Dictionary<string>;

    optionalDependencies?: Dictionary<string>;

    scripts: Dictionary<string>;
}

export interface GulpReadWriteStream extends NodeJS.ReadWriteStream {
    push(file: File): void;
}
