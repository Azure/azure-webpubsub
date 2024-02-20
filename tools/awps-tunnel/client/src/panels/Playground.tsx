import { useState, useEffect } from "react";

import { TrafficItemProps } from "../components/TrafficItem";
import { ConnectionStatus } from "../models";
import { useDataContext } from "../providers/DataContext";
import type { TabValue } from "@fluentui/react-components";
import { Dialog, DialogTrigger, DialogSurface, DialogTitle, DialogBody, DialogContent, Tab, TabList, CompoundButton, MessageBar, MessageBarBody, Button } from "@fluentui/react-components";

import { Dismiss24Regular, Dismiss16Regular, PlugDisconnected24Regular } from "@fluentui/react-icons";

import { SimpleClientSection } from "./sections/SimpleClientSection";
import { SubprotocolClientSection } from "./sections/SubprotocolClientSection";
import { MqttClientSection } from "./sections/MqttClientSection";
export interface PlaygroundProps {
  onStatusChange: (status: ConnectionStatus) => void;
}

export interface ClientPannelProps extends PlaygroundProps {
  url: string;
}

export interface PlaygroundState {
  traffic: TrafficItemProps[];
  transferFormat: "text" | "binary" | "json";
  message?: string;
  subprotocol?: string;
  error: string;
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
}

let clientCounter = 0;
export const Playground = (props: PlaygroundProps) => {
  const [selectedClient, setSelectedClient] = useState<TabValue>("");
  const [clients, setClients] = useState<TestClientViewModel[]>([]);
  const { dataFetcher } = useDataContext();
  const [url, setUrl] = useState("");
  useEffect(() => {
    const fetchUrl = async () => {
      const newUrl = await dataFetcher.invoke("getClientAccessUrl");
      setUrl(newUrl);
    };
    fetchUrl();
    const intervalId = setInterval(() => {
      fetchUrl();
    }, 60 * 10 * 1000); // every 10 minute

    // Clean up the interval on component unmount
    return () => clearInterval(intervalId);
  }, [dataFetcher]);

  useEffect(() => {}, []);
  function addTestClient(template: TestClientTemplate) {
    // TODO: when there are multiple clients with the same type in the future, we need an id generator
    clientCounter++;
    const client: TestClientViewModel = { ...template, type: template.id, id: template.id + clientCounter, counter: clientCounter };
    setClients((i) => [...i, client]);
    setSelectedClient(client.id);
  }

  const availableClients = [
    { icon: <PlugDisconnected24Regular />, title: "WebSocket", id: "websocket", description: "Simple Web PubSub Client" },
    // { icon: <PlugDisconnected24Filled />, title: "Web PubSub", id: "webpubsub", description: "Subprotocol Web PubSub Client" }, // TODO: add subprotocol support
    // { icon: <Rss24Regular />, title: "MQTT V5", id: "mqtt5", description: "MQTT V5 Client" }, // TODO: add mqtt support
  ];

  return (
    <div className="d-flex flex-column flex-fill">
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
              >Select a Test Client</DialogTitle>
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
        switch (section.type) {
          case "websocket":
            return (
              <div className="flex-fill d-flex flex-column" key={section.id} hidden={section.id !== selectedClient}>
                <SimpleClientSection onStatusChange={props.onStatusChange} url={url}></SimpleClientSection>
              </div>
            );
          case "webpubsub":
            return (
              <div className="flex-fill d-flex flex-column" key={section.id} hidden={section.id !== selectedClient}>
                <SubprotocolClientSection onStatusChange={props.onStatusChange} url={url}></SubprotocolClientSection>
              </div>
            );
          case "mqtt5":
            return (
              <div className="flex-fill d-flex flex-column" key={section.id} hidden={section.id !== selectedClient}>
                <MqttClientSection onStatusChange={props.onStatusChange} url={url}></MqttClientSection>
              </div>
            );
          default:
            throw new Error("Unknown client type");
        }
      })}
    </div>
  );
};
