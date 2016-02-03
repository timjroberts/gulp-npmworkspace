/**
 * Represents a typed version of a 'package.json' file.
 */
export interface PackageDescriptor {
    name?: string;

    version?: string;

    workspace?: boolean;

    dependencies?: IDictionary<string>;

    devDependencies?: IDictionary<string>;

    optionalDependencies?: IDictionary<string>;

    scripts: IDictionary<string>;
}
