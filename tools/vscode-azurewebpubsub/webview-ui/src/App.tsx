import "./App.css";
import { Dashboard } from "./components/Dashboard";
import { FluentProvider, webDarkTheme } from "@fluentui/react-components";
import { Component } from 'react';
import { DataProvider } from "./providers/DataContext";

export default class App extends Component {
  static displayName = App.name;

  render() {
    return (
      <FluentProvider theme={webDarkTheme}>
        <DataProvider>
          <Dashboard />
        </DataProvider>
      </FluentProvider>
    );
  }
}
