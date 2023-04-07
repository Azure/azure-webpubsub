import React, { Component } from 'react';
import { Playground } from './Playground';
import { RequestHistory } from './RequestHistory';
import './Dashboard.css';
import { Tabs } from './Tabs';
import { DefaultButton } from '@fluentui/react/lib/Button';
import { Icon } from '@fluentui/react/lib/Icon';
import * as signalR from '@microsoft/signalr';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { Connector, TwoDirectionConnector } from './Connector';

export class Dashboard extends Component {
  static displayName = Dashboard.name;

  constructor(props) {
    super(props);
    this.state = {
      connected: false,
      upstreamServerUrl: "",
      showPlayground: true,
      currentTab: 2,
      logs: "",
      showPanel: false,
      connection: null,
      serviceUrl: "",
      liveTraceUrl: "",
      tunnelConnectionStatus: "Connecting",
      clientConnectionStatus: "Disconnected",
      localServerStatus: "Disconnected",
    };
  }

  componentDidMount() {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl('/datahub')
      .withAutomaticReconnect()
      .build();
    connection.start()
      .then(() => {
        console.log('SignalR connection established.');
      })
      .catch((err) => {
        console.log('SignalR connection failed: ', err);
      }); // listen for updates from the server
    connection.on("Log", (level, time, str, ex) => {
      this.setState((prev, props) => ({ logs: prev.logs + '\n' + str }));
    });

    connection.on("ReportLiveTraceUrl", (liveTraceUrl) => {
      this.setState({ liveTraceUrl: liveTraceUrl });
    });
    connection.on("ReportServiceEndpoint", (serviceUrl) => {
      this.setState({ serviceUrl: serviceUrl });
    });
    connection.on("ReportStatusChange", (tunnelConnectionStatus) => {
      this.setState({ tunnelConnectionStatus: tunnelConnectionStatus });
    });
    connection.on("ReportLocalServerUrl", (localUrl) => {
      this.setState({ upstreamServerUrl: localUrl });
    });
    connection.on("ReportTunnelToLocalServerStatus", (status) => {
      this.setState({ localServerStatus: status });
    });
    this.setState({ connection: connection });
  }

  componentWillUnmount() {
    if (this.state.connection) {
      console.log("Stopping the connection " + this.state.connection.connectionId);
      this.state.connection.stop();
    }
  }

  render() {
    let items = [
      {
        key: "client-panel",
        title: "Your client",
        content: <Playground onStatusChange={status => this.setState({ clientConnectionStatus : status}) }></Playground>
      },
      {
        key: "service-panel",
        title: "Web PubSub service",
        content: <ServicePanel endpoint={this.state.serviceUrl} status={this.state.tunnelConnectionStatus} liveTraceUrl={this.state.liveTraceUrl} ></ServicePanel>
      },
      {
        key: "tunnel-panel",
        title: "Local tunnel",
        content: <RequestHistory connection={this.state.connection}></RequestHistory>
      },
      {
        key: "server-panel",
        title: "Your server",
        content: <ServerPanel endpoint={this.state.upstreamServerUrl }></ServerPanel>
      }
    ];
    return (
      <div className="d-flex flex-column flex-fill overflow-auto">
        <DefaultButton className="align-self-end" text="Logs >" iconProps={{ iconName: "Handwriting" }} onClick={() => this.setState({ showPanel: true })} />
        <Panel type={PanelType.medium} className="logPanel"
          isLightDismiss
          isOpen={this.state.showPanel}
          onDismiss={() => this.setState({ showPanel: false })}
          closeButtonAriaLabel="Close"
          headerText="Logs"
        >
          <textarea className="flex-fill" disabled value={this.state.logs}></textarea>
        </Panel>
        {this.workflow()}
        <Tabs className="workflow-panels" items={items} activeTab={this.state.currentTab} onTabSwitch={(i) => this.setState({ currentTab: i })}></Tabs>
      </div>
    );
  }

  workflow() {
    return (<div className="workflow d-flex flex-row justify-content-center align-items-center m-2">

      <WorkflowStep checked={this.state.currentTab === 0}
        onClick={() => this.setState({ currentTab: 0 })} iconName="SiteScan" text="Your client"></WorkflowStep>
      <Connector status={this.state.clientConnectionStatus }></Connector>
      <WorkflowStep checked={this.state.currentTab === 1}
        onClick={() => this.setState({ currentTab: 1 })} iconName="AzureLogo" text="Web PubSub service"></WorkflowStep>
      <Connector status={ this.state.tunnelConnectionStatus }></Connector>
      <WorkflowStep checked={this.state.currentTab === 2}
        onClick={() => this.setState({ currentTab: 2 })} iconName="ViewOriginal" text="Local tunnel"></WorkflowStep>
      <TwoDirectionConnector status={this.state.localServerStatus }></TwoDirectionConnector>
      <WorkflowStep checked={this.state.currentTab === 3}
        onClick={() => this.setState({ currentTab: 3 })} iconName="Home" text="Your server"></WorkflowStep>
    </div>)
  }
}

function WorkflowStep({ checked, onClick, iconName, text }) {
  return (
    <div className="d-flex flex-column align-items-center">
      <DefaultButton className="m-2" checked={checked} toggle
        onClick={onClick}
      >
        <Icon iconName={iconName} ></Icon><b className="m-2">{text}</b>
      </DefaultButton>
    </div>
  )
}

function StatusIndicator({ status }) {
  let className = status === "Connected" ? "text-success" : (status === "Disconnected" ? "text-error" : "text-warning");
  return <Icon iconName="StatusCircleInner" className={`${className} mx-2`}></Icon>
}

function ServicePanel({ endpoint, status, liveTraceUrl }) {
  return (
    <div className="m-2 d-flex flex-column flex-fill">
      <p>
        <StatusIndicator status={status}></StatusIndicator>
        <b>{status}</b><a className="mx-2" href={endpoint + "/api/health"} target="_blank" rel="noreferrer">{endpoint}</a>
      </p>
      <p>
        <Icon className="mx-2" iconName="Cloud"></Icon>
        <a href={liveTraceUrl} target="_blank" rel="noreferrer">Open live trace</a>
      </p>
      {liveTraceUrl && <iframe className="flex-fill" src={liveTraceUrl} title="Live trace"></iframe>}
    </div>
  )
}


function ServerPanel({ endpoint }) {
  return (
      <p className="m-2">
      <Icon className="mx-2" iconName="ServerEnviroment"></Icon>
        <b>Requests are sending to your local server: { endpoint }</b>
      </p>
  )
}