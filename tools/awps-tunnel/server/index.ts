#!/usr/bin/env node
import appDirs from "appdirsjs";
import path from "path";
import fs from "fs";
import packageJson from "./package.json";
import { getCommand } from "./commander";
const name = packageJson["cli-name"];

// /home/user/.config/app on Linux
// /Users/User/Library/Preferences/app on MacOS
// C:\Users\User\AppData\Roaming\app
const dir = appDirs({ appName: name }).config;
fs.mkdirSync(dir, { recursive: true });

const appConfigPath = path.join(dir, "settings.json");
const dbFile = path.join(dir, "data.sqlite");

const command = getCommand(appConfigPath, dbFile);
command.parse(process.argv);
command.action(() => command.outputHelp());
