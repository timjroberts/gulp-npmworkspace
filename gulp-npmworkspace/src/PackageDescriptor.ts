export interface PackageDescriptor {
    name?: string;

    isWorkspace?: boolean;

    dependencies?: IDictionary<string>;

    devDependencies?: IDictionary<string>;

    optionalDependencies?: IDictionary<string>;

    scripts: IDictionary<string>;
}
