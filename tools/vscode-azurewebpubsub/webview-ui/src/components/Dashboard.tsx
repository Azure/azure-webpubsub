import "./Dashboard.css";
import * as svg from "./icons";
import React, { useEffect, useState } from "react";
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel } from "@fluentui/react-components";
import { ConnectionStatus } from "../models";
import { StatusDescriptor } from "./workflows/StatusIndicator";
import { ClientPanel } from "../panels/ClientPanel";

interface WorkflowProps {
  key: string;
  title: string;
  icon: (large?: boolean) => React.ReactNode;
  status?: ConnectionStatus;
  content: React.ReactNode;
  states?: { title: React.ReactNode; content: React.ReactNode }[];
  vertical?: boolean;
  unread: number;
}

export const Dashboard = () => {
  const [clientConnectionStatus, setClientConnectionStatus] = useState(ConnectionStatus.Disconnected);

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
              {"Client Status"}
              <StatusDescriptor status={clientConnectionStatus} />
            </div>
        },
      ],
      status: clientConnectionStatus,
      content: <ClientPanel onStatusChange={(status) => setClientConnectionStatus(status)}></ClientPanel>,
    },
  ];

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

  return (
    <div className="d-flex flex-column flex-fill overflow-auto">
      <div>
        <>
          {workflows.map((w, i) => (
            <div key={i} className="d-flex flex-column flex-grow">
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
      </div>
    </div>
  );
};
