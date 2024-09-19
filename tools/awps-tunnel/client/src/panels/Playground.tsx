import { useState, useEffect } from "react";

import { ConnectionStatus } from "../models";
import { useDataContext } from "../providers/DataContext";
import type { TabValue } from "@fluentui/react-components";
import { Dialog, DialogTrigger, DialogSurface, DialogTitle, DialogBody, DialogContent, Tab, TabList, CompoundButton, MessageBar, MessageBarBody, Button } from "@fluentui/react-components";

import { Dismiss24Regular, Dismiss16Regular, PlugDisconnected24Regular, PlugDisconnected24Filled } from "@fluentui/react-icons";

import { SimpleClientSection } from "./sections/SimpleClientSection";
import { SubprotocolClientSection } from "./sections/SubprotocolClientSection";
import { MqttClientSection } from "./sections/MqttClientSection";
export interface PlaygroundProps {
  onStatusChange: (status: ConnectionStatus) => void;
}

export interface ClientPannelProps extends PlaygroundProps {
  url: string;
}

interface ConnectionHandler {
  closeConnection: () => {};
}

interface TestClientTemplate {
  icon: JSX.Element;
  title: string;
  description?: string;
  id: string;
}
interface TestClientViewModel extends TestClientTemplate {
  connection?: ConnectionHandler;
  counter: number;
  type: string;
  status?: ConnectionStatus;
}

let clientCounter = 0;
export const Playground = (props: PlaygroundProps) => {
  const [selectedClient, setSelectedClient] = useState<TabValue>("");
  const [clients, setClients] = useState<TestClientViewModel[]>([]);
  const { dataFetcher } = useDataContext();
  const [url, setUrl] = useState("");
  useEffect(() => {
    const fetchUrl = async () => {
      const newUrl = await dataFetcher.invoke("getClientAccessUrl", undefined, undefined, undefined);
      setUrl(newUrl);
    };
    fetchUrl();
    const intervalId = setInterval(() => {
      fetchUrl();
    }, 60 * 10 * 1000); // every 10 minute

    // Clean up the interval on component unmount
    return () => clearInterval(intervalId);
  }, [dataFetcher]);

  useEffect(() => {
    props.onStatusChange(clients.some((i) => i.status === ConnectionStatus.Connected) ? ConnectionStatus.Connected : ConnectionStatus.Disconnected);
  }, [clients, props]);
  function addTestClient(template: TestClientTemplate) {
    // TODO: when there are multiple clients with the same type in the future, we need an id generator
    clientCounter++;
    const client: TestClientViewModel = { ...template, type: template.id, id: template.id + clientCounter, counter: clientCounter };
    setClients((i) => [...i, client]);
    setSelectedClient(client.id);
  }

  const availableClients = [
    { icon: <PlugDisconnected24Regular />, title: "Raw", id: "websocket", description: "The Raw WebSocket Client" },
    { icon: <PlugDisconnected24Filled />, title: "PubSub", id: "webpubsub", description: "The PubSub WebSocket Client" }, // TODO: add subprotocol support
    // { icon: <Rss24Regular />, title: "MQTT V5", id: "mqtt5", description: "MQTT V5 Client" }, // TODO: add mqtt support
  ];

  return (
    <div className="d-flex flex-column flex-fill overflow-auto">
      <div>
        <Dialog>
          <DialogTrigger disableButtonEnhancement>
            <Button className="float-right">Add a Test Client</Button>
          </DialogTrigger>
          <DialogSurface>
            <DialogBody>
              <DialogTitle
                action={
                  <DialogTrigger action="close">
                    <Button appearance="subtle" aria-label="close" icon={<Dismiss24Regular />} />
                  </DialogTrigger>
                }
              >
                Select a Test Client
              </DialogTitle>
              <DialogContent>
                <div className="m-2 d-flex">
                  {availableClients.map((i) => (
                    <DialogTrigger key={i.id} disableButtonEnhancement>
                      <CompoundButton className="m-2 w-100" onClick={() => addTestClient(i)} icon={i.icon} secondaryContent={i.description}>
                        {i.title}
                      </CompoundButton>
                    </DialogTrigger>
                  ))}
                </div>
              </DialogContent>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      </div>
      {clients.length === 0 && (
        <MessageBar>
          <MessageBarBody>Get started with a test client.</MessageBarBody>
        </MessageBar>
      )}
      <TabList
        selectedValue={selectedClient}
        onTabSelect={(_, d) => {
          setSelectedClient(d.value);
        }}
      >
        {clients.map((section, index) => (
          <Tab key={section.id} value={section.id}>
            {section.icon} {section.title} - Client{section.counter}
            <Dismiss16Regular
              className="mx-1"
              onClick={(e) => {
                e.stopPropagation();
                section.connection?.closeConnection();
                setClients((i) => {
                  if (selectedClient === section.id && clients.length > 1) {
                    setSelectedClient(clients.find((i) => i.id !== selectedClient)?.id ?? "");
                  }
                  return i.filter((i) => i.id !== section.id);
                });
              }}
            />
          </Tab>
        ))}
      </TabList>
      {clients.map((section, index) => {
        const ClientComponent = section.type === "websocket" ? SimpleClientSection : section.type === "webpubsub" ? SubprotocolClientSection : MqttClientSection;
        return (
          <div className="flex-fill d-flex flex-column overflow-auto" key={section.id} hidden={section.id !== selectedClient}>
            <ClientComponent
              onStatusChange={(s) => {
                setClients((i) => {
                  return i.map((c) => {
                    if (c.id === section.id) {
                      return { ...c, status: s };
                    }
                    return c;
                  });
                });
              }}
              url={url}
            ></ClientComponent>
          </div>
        );
      })}
    </div>
  );
};
