import * as util from "gulp-util";
import * as _ from "underscore";
import * as path from "path";
import * as fs from "fs";
import * as childProcess from "child_process";
import * as semver from "semver";

import {Logger} from "./Logging";

/**
 * Provides context for a Gulp plugin that works with 'npm'.
 *
 * @typeparam TOptions The options type that will be associated with the plugin implementation.
 */
export class NpmPluginBinding<TOptions> {
    /**
     * Initialises the new binding object.
     *
     * @param options The options that are to be associated with the running plugin implementation.
     */
    constructor(public options: TOptions) {
    }

    /**
     * Converts a semver version to a semver range that is compatible with the 'npm install' command.
     *
     * @param version A semver version (i.e., ~1.2.3).
     *
     * @returns A string that represents a semver range that is equivilant to the provided version
     * (i.e., ~1.2.x).
     */
    public toSemverRange(version: string): string {
        let matches = /^(\^|~)?(?:(\d+)\.?)(?:(\d+)\.?)?(?:(\d+)\.?)?/g.exec(version);

        if (!matches || !matches[1]) return version;

        if (matches[1] === "^") {
            return `^${matches[2]}.x.x`;
        }
        else {
            return `~${matches[2]}.${matches[3] ? matches[3] : "x"}.x`;
        }
    }

    /**
     * Creates a symbolic link to a folder representing a package.
     *
     * @param sourcePath The path of the souce package (its node_modules folder will be updated).
     * @param packageName The name of the package being symbolically linked.
     * @param targetPath The path of the folder that is being linked.
     */
    public createPackageSymLink(sourcePath: string, packageName: string, targetPath: string): void {
        sourcePath = path.resolve(sourcePath, "node_modules");

        if (fs.existsSync(path.resolve(sourcePath, packageName))) return;
        if (!fs.existsSync(sourcePath)) fs.mkdirSync(sourcePath);

        fs.symlinkSync(targetPath, path.join(sourcePath, packageName), "dir");
    }

    /**
     * Executes the 'npm install' command for the packages specified in the registry package map.
     *
     * @param packagePath The folder of the package that is to be installed.
     * @param registryMap The map of registry and packages that should be installed.
     */
    public shellExecuteNpmInstall(packagePath: string, registryMap: IDictionary<Array<string>>): void {
        const INSTALLABLE_PACKAGE_CHUNKSIZE: number = 50;

        for (let registry in registryMap) {
            let packages = registryMap[registry];

            if (!packages || packages.length === 0) continue;

            // Install packages in bundles because command line lengths aren't infinite. Windows for example has
            // a command line limit of 8192 characters. It's variable on *nix and OSX but will in the 100,000s

            let installablePackages = _.first(packages, INSTALLABLE_PACKAGE_CHUNKSIZE);
            packages = _.rest(packages, INSTALLABLE_PACKAGE_CHUNKSIZE);

            while (installablePackages && installablePackages.length > 0) {
                var installArgs = ["install"].concat(installablePackages);

                if (packagePath === process.cwd()) {
                    installArgs.push("--ignore-scripts");
                }

                if (registry !== "*") {
                    installArgs.push("--registry");
                    installArgs.push(registry);
                }

                this.shellExecuteNpm(packagePath, installArgs);

                installablePackages = _.first(packages, INSTALLABLE_PACKAGE_CHUNKSIZE);
                packages = _.rest(packages, INSTALLABLE_PACKAGE_CHUNKSIZE);
            }
        }
    }

    /**
     * Executes the 'npm' command on the platform.
     *
     * @param packagePath The folder in which to execute the npm command.
     * @param cmdArgs An array of arguments to pass to npm.
     */
    public shellExecuteNpm(packagePath: string, cmdArgs: Array<string>): void {
        var result = childProcess.spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", cmdArgs, { cwd: packagePath });

        if (result.status !== 0) {
            Logger.verbose((logger) => {
                logger(`npm ${cmdArgs.join(" ")}`);
            });

            throw new Error(result.stderr.toString());
        }
    }
}
