/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { gulp_installAzureAccount, gulp_installResourceGroups, gulp_webpack } from '@microsoft/vscode-azext-dev';
import * as fse from 'fs-extra';
import * as gulp from 'gulp';
import * as path from 'path';

declare let exports: { [key: string]: unknown };

async function prepareForWebpack(): Promise<void> {
    const mainJsPath: string = path.join(__dirname, 'main.js');
    let contents: string = (await fse.readFile(mainJsPath)).toString();
    contents = contents
        .replace('out/extension.bundle', 'dist/extension.bundle')
        .replace(', true /* ignoreBundle */', '');
    await fse.writeFile(mainJsPath, contents);
}

async function listIcons(): Promise<void> {
    const rootPath: string = path.join(__dirname, 'resources', 'providers');
    const subDirs: string[] = (await fse.readdir(rootPath)).filter(dir => dir.startsWith('microsoft.'));
    // tslint:disable-next-line: no-constant-condition
    while (true) {
        const subDir: string | undefined = subDirs.pop();
        if (!subDir) {
            break;
        } else {
            const subDirPath: string = path.join(rootPath, subDir);
            const paths: string[] = await fse.readdir(subDirPath);
            for (const p of paths) {
                const subPath: string = path.posix.join(subDir, p);
                if (subPath.endsWith('.svg')) {
                    console.log(`'${subPath.slice(0, -4)}',`);
                } else {
                    subDirs.push(subPath);
                }
            }
        }
    }
}

async function cleanReadme(): Promise<void> {
    const readmePath: string = path.join(__dirname, 'README.md');
    let data: string = (await fse.readFile(readmePath)).toString();
    data = data.replace(/<!-- region exclude-from-marketplace -->.*?<!-- endregion exclude-from-marketplace -->/gis, '');
    await fse.writeFile(readmePath, data);
}

exports['webpack-dev'] = gulp.series(prepareForWebpack, () => gulp_webpack('development'));
exports['webpack-prod'] = gulp.series(prepareForWebpack, () => gulp_webpack('production'));
exports.preTest = gulp.series(gulp_installAzureAccount, gulp_installResourceGroups);
exports.listIcons = listIcons;
exports.cleanReadme = cleanReadme;
