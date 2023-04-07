import React, { Component } from 'react';
import { DefaultButton, IComboBoxOption, ComboBox, SelectableOptionMenuItemType } from '@fluentui/react';
import './Playground.css';

import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { DetailsList, DetailsListLayoutMode, Selection, SelectionMode, IColumn } from '@fluentui/react/lib/DetailsList';
import { Icon } from '@fluentui/react/lib/Icon';
import moment from 'moment';

import { TextField } from '@fluentui/react/lib/TextField';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { ResizablePanel } from './ResizablePanel';

/**
 * onStatusChange(status)
 */
export class Playground extends Component {
  static displayName = Playground.name;

  constructor(props) {
    super(props);
    this.state = {
      loading: true, endpoint: "", url: "", hub: ""
      , connected: false,
      transferFormat: "json",
      message: "",
      showSubprotocol: false,
      subprotocol: "",
      traffic: [],
      error: ""
    };

    this.connect = this.connect.bind(this);
    this.send = this.send.bind(this);
  }

  async componentDidMount() {
    console.log("playground component mounted");
    const response = await fetch('webpubsuburl');
    const data = await response.json();
    this.setState({
      loading: false,
      endpoint: data.endpoint,
      url: data.url,
      hub: data.hub
    });
  }

  componentWillUnmount() {
    if (this.connection) this.connection.close();
  }

  connect() {
    try {
      const connection = new WebSocket(this.state.url);
      connection.onopen = ((event) => {
        this.props.onStatusChange("Connected");
        this.setState({ connected: true, traffic: [], error: "" });
      });
      connection.onclose = ((event) => {
        this.props.onStatusChange("Disconnected");
        this.setState({
          connected: false,
          traffic: [],
          error: `WebSocket connection closed with code ${event.code}, reason ${event.reason}.`
        });
      });
      connection.onmessage = (ev => {
        this.setState({ traffic: [{ content: ev.data }, ...this.state.traffic] })
      });
      this.connection = connection;
    } catch (e) {
      this.setState({ error: "Error establishing the WebSocket connection." })
    }
  }

  send() {
    if (!this.connection) {
      console.error("Connection is not connected");
      return;
    }
    const message = this.state.message;
    this.connection.send(message);
    this.setState({ message: "", traffic: [{ content: message, up: true, }, ...this.state.traffic] });
  }

  render() {

    const options: IComboBoxOption[] = [
      { key: 'Json', text: 'Service supported JSON protocols', itemType: SelectableOptionMenuItemType.Header },
      { key: 'A', text: 'json.webpubsub.azure.v1' },
      { key: 'B', text: 'json.reliable.webpubsub.azure.v1' },
      { key: 'divider', text: '-', itemType: SelectableOptionMenuItemType.Divider },
      { key: 'binary', text: 'Service supported binary protocols', itemType: SelectableOptionMenuItemType.Header },
      { key: 'C', text: 'protobuf.webpubsub.azure.v1' },
      { key: 'D', text: 'protobuf.reliable.webpubsub.azure.v1' },
    ];

    const transferOptions: IDropdownOption[] = [
      { key: 'text', text: 'Text' },
      { key: 'binary', text: 'Binary' },
    ];

    const connectPane = (
      <div className="d-flex flex-column websocket-client-container m-2">
        <b>Quick try</b>
        <input disabled={true} value={this.state.url}></input>
        <DefaultButton hidden={this.state.loading || this.state.connected} onClick={this.connect}>Connect</DefaultButton>
        {this.state.connected && <p className="text-success"><i>Connected</i></p>}
        {false && <Checkbox label="Specify subprotocol" checked={this.state.showSubprotocol} onChange={(e, c) => this.setState({ showSubprotocol: c })} />}
        <ComboBox
          hidden={!this.state.showSubprotocol}
          label="Subprotocol"
          allowFreeform="true"
          autoComplete='on'
          options={options}
          value={this.state.subprotocol}
          onChange={(e, c, i, value) => this.setState({ subprotocol: value })}
        />
        {this.state.error && <b className="text-danger">{this.state.error}</b> }
        {this.state.connected && (<div className="controlpane d-flex flex-column">

          {false && <Dropdown
            label="Transfer Format"
            defaultSelectedKey={this.state.transferFormat}
            options={transferOptions}
            onChange={(e, i) => this.setState({ transferFormat: i.key })}
          />}
          <TextField label="Messages" multiline autoAdjustHeight value={this.state.message} onChange={(e, t) => this.setState({ message: t })} />
          <DefaultButton disabled={!this.state.connected || !this.state.message} text="Send" onClick={this.send}></DefaultButton>
        </div>)}
      </div>
    );

    function transform({ content, up }) {
      // todo: binary
      return {
        Data: up ? <TrafficUp content={content}></TrafficUp> : <TrafficDown content={content}></TrafficDown>,
        Time: moment().format(),
        Length: content.length
      }
    }
    const trafficList = this.state.traffic.map(i => transform(i));
    const trafficPane = <div><DetailsList items={trafficList} selectionMode={SelectionMode.none} layoutMode={DetailsListLayoutMode.justified}></DetailsList></div>;

    return (
      <div className="d-flex flex-column" style={{ height: "100%" }}>
        <p className="m-2"><Icon iconName="Brunch"></Icon><b >Open you own client or have a quick try here.</b></p>
       <ResizablePanel className="flex-fill" left={connectPane} right={trafficPane}></ResizablePanel>
      </div>
    )
  }
}

function TrafficUp({ content }) {
  return <p><Icon iconName="DoubleChevronUp8" className="text-success mx-2"></Icon>{content}</p>

}

function TrafficDown({ content }) {
  return <p><Icon iconName="DoubleChevronDown8" className="text-danger mx-2"></Icon>{content}</p>
}


