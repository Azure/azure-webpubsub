import { vscode } from "./utilities/vscode";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import "./custom.css";
import { ClientPanel } from "./panels/ClientPanel";
import { ConnectionStatus } from "./models";
import { useState } from "react";
import { DataProvider } from "./providers/DataContext";
import { Dashboard } from "./components/Dashboard";
import { FluentProvider, webDarkTheme, webLightTheme, Theme } from "@fluentui/react-components";
import React, { Component } from 'react';

export default class App extends Component {
  static displayName = App.name;

  // create a state, to get the current theme value from document.querySelector("body > div")

  render() {
    // const [theme, setTheme] = useState<Theme>(
    //   ((document.querySelector("body > div") as any).className ?? "").indexOf("light-theme") !== -1 ? webLightTheme : webDarkTheme
    // )

    return (
      
      // <FluentProvider theme={webLightTheme}>
      //   <DataProvider>
      //     <Dashboard />
      //   </DataProvider>
      // </FluentProvider>
      <FluentProvider theme={webDarkTheme}>
        <Dashboard />
      </FluentProvider>
    );
  }
}
