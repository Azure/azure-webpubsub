import React, { useEffect, useState } from "react";
import { RequestHistory } from "./panels/RequestHistory";
import "./Dashboard.css";
import { Panel, PanelType } from "@fluentui/react";
import { Tab, TabList, Accordion, AccordionHeader, AccordionItem, AccordionPanel, ToggleButton, CounterBadge } from "@fluentui/react-components";
import * as svg from "./icons";
import { DocumentOnePageMultiple24Regular, Link24Regular } from "@fluentui/react-icons";
import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";

import { Connector, TwoDirectionConnector } from "./Connector";
import { useDataContext } from "../providers/DataContext";
import { LogLevel, ConnectionStatus, ConnectionStatusPair } from "../models";
import { WorkflowStep } from "./workflows/WorkflowStep";
import { ServicePanel } from "./panels/ServicePanel";
import { ServerPanel } from "./panels/ServerPanel";
import { ResizablePanel } from "./ResizablePanel";
import { StatusDescriptor, StatusDisplayText } from "./workflows/StatusIndicator";
import { ClientPanel } from "./panels/ClientPanel";
import { EventHandler } from "./EventHandler";

interface WorkflowProps {
  key: string;
  title: string;
  icon: (large?: boolean) => React.ReactNode;
  status?: ConnectionStatus;
  statusPair?: ConnectionStatusPair;
  content: React.ReactNode;
  states?: { title: React.ReactNode; content: React.ReactNode }[];
  vertical?: boolean;
  unread: number;
}

function loadCurrentTab(): string {
  const tab = localStorage.getItem("currentTab");
  if (tab) {
    return tab;
  }
  return "proxy";
}

function setCurrentTab(tab: string): void {
  localStorage.setItem("currentTab", tab);
}

export const Dashboard = () => {
  const [showPanel, setShowPanel] = useState(false);
  const [clientConnectionStatus, setClientConnectionStatus] = useState(ConnectionStatus.Disconnected);
  const { data, dataFetcher } = useDataContext();
  const [tunnelUnread, setTunnelUnread] = useState(0);
  const onStartUpstream = async (start: boolean) => {
    return start ? await dataFetcher.invoke("startEmbeddedUpstream") : await dataFetcher.invoke("stopEmbeddedUpstream");
  };
  const workflows: WorkflowProps[] = [
    {
      unread: 0,
      key: "client",
      title: "Client",
      icon: svg.SvgClient,
      states: [
        {
          title: "Test Client status",
          content: <StatusDescriptor status={clientConnectionStatus} />,
        },
      ],
      status: clientConnectionStatus,
      content: <ClientPanel onStatusChange={(status) => setClientConnectionStatus(status)}></ClientPanel>,
    },
    {
      unread: 0,
      key: "service",
      title: "Web PubSub",
      icon: svg.SvgWebPubSub,
      vertical: true,
      states: [
        {
          title: "Endpoint",
          content: data.endpoint,
        },
        EventHandler({ hub: data.hub, settings: data.serviceConfiguration }),
      ],
      status: data?.tunnelConnectionStatus,
      content: (
        <ServicePanel
          endpoint={data.endpoint}
          status={data.tunnelConnectionStatus}
          liveTraceUrl={data.liveTraceUrl}
          tokenGenerator={() => dataFetcher.invoke("generateLiveTraceToken")}
        ></ServicePanel>
      ),
    },
    {
      key: "proxy",
      title: "Local Tunnel",
      states: [
        {
          title: "Connect from",
          content: data.endpoint,
        },
        {
          title: "Send requests to",
          content: data.upstreamServerUrl,
        },
      ],
      statusPair: data.tunnelServerStatus,
      icon: svg.SvgTunnel,
      unread: tunnelUnread,
      content: <RequestHistory onUnreadChange={(i) => setTunnelUnread(i)} />,
    },
    {
      unread: 0,
      key: "server",
      title: "Server",
      icon: svg.SvgServer,
      states: [
        {
          title: "Last Status",
          content: <StatusDisplayText status={data.tunnelServerStatus} />,
        },
        {
          title: "Configured Upstream Server URL",
          content: data.upstreamServerUrl,
        },
      ],
      content: <ServerPanel endpoint={data?.upstreamServerUrl} onChange={onStartUpstream}></ServerPanel>,
    },
  ];
  // read current tab from local storage
  const [selectedValue, setSelectedValue] = React.useState<string>(loadCurrentTab());

  useEffect(() => {
    setCurrentTab(selectedValue);
  }, [selectedValue]);

  const workflow = () => (
    <div className="workflow d-flex flex-row justify-content-center align-items-center m-2">
      {workflows.map((w, i) => (
        <React.Fragment key={i}>
          <WorkflowStep checked={selectedValue === w.key} unread={w.unread} onClick={() => setSelectedValue(w.key)} icon={w.icon(true)} text={w.title} />
          {w.status && <Connector status={w.status} />}
          {w.statusPair && <TwoDirectionConnector statusPair={w.statusPair} />}
        </React.Fragment>
      ))}
    </div>
  );

  const onTabSelect = (event: SelectTabEvent, data: SelectTabData) => {
    setSelectedValue(data.value as string);
  };

  const tabSidebar = (
    <>
      <TabList size="large" className="m-2" selectedValue={selectedValue} onTabSelect={onTabSelect} vertical>
        {workflows.map((w, i) => (
          <React.Fragment key={i}>
            <Tab id={w.key} icon={<span>{w.icon()}</span>} value={w.key}>
              {w.title} {w.unread > 0 && <CounterBadge size="small" count={w.unread}></CounterBadge>}
            </Tab>
          </React.Fragment>
        ))}
      </TabList>
      <Accordion collapsible>
        <AccordionItem value="1">
          <AccordionHeader>Help center</AccordionHeader>
          <AccordionPanel>
            <ToggleButton appearance="subtle" icon={<DocumentOnePageMultiple24Regular />} checked={showPanel} onClick={() => setShowPanel(true)}>
              View logs
            </ToggleButton>
            <ToggleButton as="a" appearance="transparent" icon={<Link24Regular />}>
              <a target="_blank" rel="noreferrer" href="https://aka.ms/awps/getting-started">
                Documentation
              </a>
            </ToggleButton>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </>
  );
  const paneOverview = (p: WorkflowProps) => (
    <div className={p.vertical ? "d-flex flex-column justify-content-start" : "d-flex justify-content-start"}>
      {p.states?.map((s, i) => (
        <div key={i} className="d-flex m-2 flex-column">
          <div>
            <b>{s.title}</b>
          </div>
          {s.content}
        </div>
      ))}
    </div>
  );
  const connectPane = (
    <>
      {workflows.map((w, i) => (
        // Use hidden to prevent re-rendering
        <div key={i} hidden={selectedValue !== w.key} className="d-flex flex-column flex-fill overflow-auto">
          <Accordion className="" collapsible defaultOpenItems={"1"}>
            <AccordionItem value="1">
              <AccordionHeader size="large">{w.title}</AccordionHeader>
              <AccordionPanel>{paneOverview(w)}</AccordionPanel>
            </AccordionItem>
          </Accordion>
          <hr />
          {w.content}
        </div>
      ))}
    </>
  );

  return (
    <div className="d-flex flex-column flex-fill overflow-auto">
      <Panel type={PanelType.medium} className="logPanel" isLightDismiss isOpen={showPanel} onDismiss={() => setShowPanel(false)} closeButtonAriaLabel="Close" headerText="Logs">
        <textarea className="flex-fill" disabled value={data.logs.map((log) => `${log.time.toISOString()} [${LogLevel[log.level]}] ${log.message}`).join("\n")} />
      </Panel>
      {workflow()}
      <ResizablePanel className="flex-fill" left={tabSidebar} right={connectPane} initialLeftWidth="200px"></ResizablePanel>
    </div>
  );
};
