import * as path from "path"

import {PackageDescriptor} from "../PackageDescriptor";

interface ArgumentOptions {
    package?: string;

    verbose?: boolean;

    bumpversion?: string;
}

const argv: ArgumentOptions = require("yargs")
    .alias("p", "package")
    .alias("v", "verbose")
    .argv;

export const pluginName = (<PackageDescriptor>require(path.join(__dirname, "../../package.json"))).name;

export function getPackageName(): string {
    if (!argv.package) {
        return undefined;
    }

    let matches = /^(\!?)(.+)/g.exec(argv.package);

    return (!matches || !matches[2]) ? undefined : matches[2];
}

export function getExclusivePackageName(): string {
    if (!argv.package) return undefined;

    let matches = /^\!(.+)/g.exec(argv.package);

    return (!matches) ? undefined : matches[1];
}

export function getVerboseLoggingFlag(): boolean {
    return argv.verbose;
}

export function getBumpVersionToken(): string {
    if (!argv.bumpversion) return undefined;

    return argv.bumpversion;
}
