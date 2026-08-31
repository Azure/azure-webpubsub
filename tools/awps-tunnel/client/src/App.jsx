import React, { Component } from 'react';
import './custom.css';
import { Dashboard } from "./components/Dashboard";

import { DataProvider } from './providers/DataContext';

import {
  FluentProvider,
  webLightTheme,
} from "@fluentui/react-components";
export default class App extends Component {
  static displayName = App.name;

  render() {
    return (

      <FluentProvider theme={webLightTheme}>
        <DataProvider>
          <Dashboard />
        </DataProvider>
      </FluentProvider>
    );
  }
}
