import * as util from "gulp-util";
import * as path from "path";
import * as fs from "fs";
import * as rimraf from "rimraf";

import {PackageDescriptor} from "../PackageDescriptor";
import {ConditionableAction, AsyncAction} from "../Plugins/ConditionableAction";
import {Logger} from "../Plugins/utilities/Logging";

/**
 * Returns true if the specified package path contains a 'typings.json' file.
 *
 * @param packagePath The workspace package path.
 *
 * @returns true if the package contains a 'typings.json' file.
 */
function hasTypingsFile(packgePath: string): boolean {
    return fs.existsSync(path.join(packgePath, "typings.json"));
}

/**
 * Returns a [[ConditionableAction<>]] that invokes the 'typings' package to install the configured
 * typings.
 */
export function installTypings(): ConditionableAction<AsyncAction> {
    return {
        condition: function (packageDescriptor: PackageDescriptor, packagePath: string): boolean {
            return hasTypingsFile(packagePath);
        },

        action: function (packageDescriptor: PackageDescriptor, packagePath: string, callback: (error?: Error) => void): void {
            let typings: any;

            try {
                typings = require("typings");
            }
            catch (error) {
                callback(new Error("Could not load the 'typings' package. Add 'typings' to the workspace 'package.json'."));
            }

            Logger.verbose(`Running 'typings ${typings.VERSION}' for workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

            typings.install({ cwd: packagePath })
                .then((tree) => {
                    callback();
                })
                .catch((error) => {
                    callback(new Error(`'typings' package returned an error: ${error.message}`));
                });
        }
    };
}

/**
 * Returns a [[ConditionableAction<>]] that creates symbolic links for the configured typings where they are
 * 'file:' references.
 *
 * @param targetPath The path (relative to the workspace package) where the linked typings will be created.
 */
export function installTypingsAsLinks(targetPath: string): ConditionableAction<AsyncAction> {
    return {
        condition: function (packageDescriptor: PackageDescriptor, packagePath: string): boolean {
            return hasTypingsFile(packagePath);
        },

        action: function (packageDescriptor: PackageDescriptor, packagePath: string, callback: (error?: Error) => void): void {
            let packageTypingsFilePath = path.join(packagePath, "typings.json");
            let packageTypingsPath = path.join(packagePath, targetPath);

            if (!fs.existsSync(packageTypingsPath)) {
                fs.mkdirSync(packageTypingsPath);
            }
            else {
                rimraf.sync(packageTypingsPath + "/**/*");
            }

            Logger.verbose(`Linking typings for workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

            let typingFilePaths = getTypingFileReferences(require(packageTypingsFilePath));

            for (let typingFilePathEntry in typingFilePaths) {
                let typingFilePath = path.resolve(packagePath, typingFilePaths[typingFilePathEntry]);
                let targetTypingFilePath = path.join(packageTypingsPath, typingFilePathEntry);

                fs.mkdirSync(targetTypingFilePath);

                fs.symlinkSync(typingFilePath, path.join(targetTypingFilePath, `${typingFilePathEntry}.d.ts`));

                Logger.verbose(`Linked typing '${util.colors.cyan(typingFilePathEntry)}' (-> '${util.colors.blue(typingFilePath)}')`);
            }

            callback();
        }
    }
}

/**
 * Returns a dictionary of typing mappings that represent local file references from within a
 * given 'typings.json'.
 *
 * @param typingsDescriptor The 'typings.json' object.
 *
 * @returns A dictionary where the keys are typing names, and the values are the file paths to the
 * typing declaration.
 */
function getTypingFileReferences(typingsDescriptor: Object): IDictionary<string> {
    let typingPaths: IDictionary<string> = { };

    for (let d in typingsDescriptor) {
        for (let ds in typingsDescriptor[d]) {
            let typingReference: string = typingsDescriptor[d][ds];

            let result = /file:(.*)/g.exec(typingReference);

            if (result) typingPaths[ds] = result[1];
        }
    }

    return typingPaths;
}
