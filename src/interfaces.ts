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

/**
 * An action that can be executed before the TypeScript compiler is executed.
 */
export interface PreCompileAction {
    /**
     * Executes the pre-compilation action.
     *
     * @param packagePath The path to the root of the package.
     * @param compilerOptions A hash of the TypeScript compiler options.
     * @excludedFolders An array of folders that should be excluded from compilation.
     * @onCompleteFunc The callback to invoke when the pre-compilation action is complete.
     */
    (packagePath: string, compilerOptions: Object, excludedFolders: Array<string>, onCompleteFunc: Function): void;
}
