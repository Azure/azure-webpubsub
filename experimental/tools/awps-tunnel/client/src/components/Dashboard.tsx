import React, { useState } from 'react';
import { Playground } from './panels/Playground';
import { RequestHistory } from './panels/RequestHistory';
import './Dashboard.css';
import { Tabs } from './Tabs';
import { DefaultButton } from '@fluentui/react/lib/Button';
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { Connector, TwoDirectionConnector } from './Connector';
import { useDataContext } from '../providers/DataContext';
import { LogLevel, ConnectionStatus, ConnectionStatusPair } from '../providers/models';
import { WorkflowStep } from './workflows/WorkflowStep';
import { ServicePanel } from './panels/ServicePanel';
import { ServerPanel } from './panels/ServerPanel';


interface WorkflowProps {
  key: string;
  title: string;
  iconName: string;
  status?: ConnectionStatus;
  statusPair?: ConnectionStatusPair;
  content: React.ReactNode;
}

export const Dashboard = () => {
  const [currentTab, setCurrentTab] = useState(2);
  const [showPanel, setShowPanel] = useState(false);
  const [clientConnectionStatus, setClientConnectionStatus] = useState(ConnectionStatus.Disconnected);
  const { data } = useDataContext();


  const workflows: WorkflowProps[] = [
    {
      key: 'client',
      title: 'Your client',
      iconName: 'SiteScan',
      status: clientConnectionStatus,
      content: (
        <Playground
          onStatusChange={(status) => setClientConnectionStatus(status)}
        ></Playground>
      ),
    }, {
      key: 'service',
      title: 'Web PubSub',
      iconName: 'AzureLogo',
      status: data?.tunnelConnectionStatus,
      content: (
        <ServicePanel
          endpoint={data.endpoint}
          status={data.tunnelConnectionStatus}
          liveTraceUrl={data.liveTraceUrl}
        ></ServicePanel>
      )
    }, {
      key: 'proxy',
      title: 'Local Tunnel',
      iconName: 'ViewOriginal',
      statusPair: data.tunnelServerStatus,
      content: <RequestHistory />
    }, {
      key: 'server',
      title: 'Your server',
      iconName: 'Home',
      content: (
        <ServerPanel
          endpoint={data?.upstreamServerUrl}
        ></ServerPanel>
      )
    },
  ]
  const workflow = () => (
    <div className="workflow d-flex flex-row justify-content-center align-items-center m-2">
      {workflows.map((w, i) => (
        <React.Fragment key={i}>
          <WorkflowStep
            checked={currentTab === i}
            onClick={() => setCurrentTab(i)}
            iconName={w.iconName}
            text={w.title}
          />
          {w.status && <Connector status={w.status} />}
          {w.statusPair && <TwoDirectionConnector statusPair={w.statusPair} />}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="d-flex flex-column flex-fill overflow-auto">
      <DefaultButton
        className="align-self-end"
        text="Logs >"
        iconProps={{ iconName: 'Handwriting' }}
        onClick={() => setShowPanel(true)}
      />
      <Panel
        type={PanelType.medium}
        className="logPanel"
        isLightDismiss
        isOpen={showPanel}
        onDismiss={() => setShowPanel(false)}
        closeButtonAriaLabel="Close"
        headerText="Logs"
      >
        <textarea className="flex-fill" disabled value={
          data.logs.map(log => `${log.time.toISOString()} [${LogLevel[log.level]}] ${log.message}`).join('\n')} />
      </Panel>
      {workflow()}
      <Tabs
        className="workflow-panels"
        items={workflows}
        activeTab={currentTab}
        onTabSwitch={(i) => setCurrentTab(i)}
      ></Tabs>
    </div>
  );
};


