import React, { useEffect, useMemo, useState } from "react";
import "./Dashboard.css";
import { Panel, PanelType } from "@fluentui/react";
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel } from "@fluentui/react-components";
import * as svg from "./icons";

import { LogLevel, ConnectionStatus, ConnectionStatusPair } from "../models";
import { StatusDescriptor } from "./workflows/StatusIndicator";
import { ClientPanel } from "../panels/ClientPanel";
import { vscode } from "../utilities/vscode";
import { VSCodeTag } from "@vscode/webview-ui-toolkit/react";

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
  // const { data, dataFetcher } = useDataContext();
  const [tunnelUnread, setTunnelUnread] = useState(0);
  // const onStartUpstream = async (start: boolean) => {
  //   return start ? await dataFetcher.invoke("startEmbeddedUpstream") : await dataFetcher.invoke("stopEmbeddedUpstream");
  // };
  const workflows: WorkflowProps[] = [
    {
      unread: 0,
      key: "client",
      title: "Azure Web PubSub Test Clients",
      icon: svg.SvgClient,
      states: [
        {
          title: "Status",
          content: 
            <div> 
              <VSCodeTag> {"Client Status"} </VSCodeTag> <StatusDescriptor status={clientConnectionStatus} />
            </div>
        },
      ],
      status: clientConnectionStatus,
      content: <ClientPanel onStatusChange={(status) => setClientConnectionStatus(status)}></ClientPanel>,
    },
  ];
  // read current tab from local storage
  const [selectedValue, setSelectedValue] = React.useState<string>(loadCurrentTab());

  useEffect(() => {
    setCurrentTab(selectedValue);
  }, [selectedValue]);

  const paneOverview = (p: WorkflowProps) => (
    <div className={p.vertical ? "d-flex flex-column justify-content-start" : "d-flex justify-content-start"}>
      {p.states?.map((s, i) => (
        <div key={i} className="d-flex m-2 flex-column">
          <div>
            {s.content}
          </div>
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
              <AccordionHeader size="extra-large">{w.title}</AccordionHeader>
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
      {/* {workflow()} */}
      {/* <ResizablePanel className="flex-fill" left={tabSidebar} right={connectPane} initialLeftWidth="200px"></ResizablePanel> */}
      <div>
        {connectPane}
      </div>
    </div>
  );
};
