import { useState, useEffect, useRef, useMemo } from "react";

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
  allowUrlEdit?: boolean;
  onUrlChange?: (url: string) => void;
  showHints?: boolean;
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
  const isManual = dataFetcher.kind === "manual";
  const [dialogOpen, setDialogOpen] = useState(false);
  const addedInitialClient = useRef(false);
  function addTestClient(template: TestClientTemplate) {
    // TODO: when there are multiple clients with the same type in the future, we need an id generator
    clientCounter++;
    const client: TestClientViewModel = { ...template, type: template.id, id: template.id + clientCounter, counter: clientCounter };
    setClients((i) => [...i, client]);
    setSelectedClient(client.id);
  }

  const availableClients = useMemo(
    () => [
      { icon: <PlugDisconnected24Regular />, title: "Raw", id: "websocket", description: "The Raw WebSocket Client" },
      { icon: <PlugDisconnected24Filled />, title: "PubSub", id: "webpubsub", description: "The PubSub WebSocket Client" }, // TODO: add subprotocol support
      // { icon: <Rss24Regular />, title: "MQTT V5", id: "mqtt5", description: "MQTT V5 Client" }, // TODO: add mqtt support
    ],
    [],
  );
  useEffect(() => {
    const fetchUrl = async () => {
      const newUrl = await dataFetcher.invoke("getClientAccessUrl", undefined, undefined, undefined);
      setUrl(newUrl);
    };
    fetchUrl();
    const intervalId = isManual
      ? undefined
      : setInterval(() => {
          fetchUrl();
        }, 60 * 10 * 1000); // every 10 minute

    // Clean up the interval on component unmount
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [dataFetcher, isManual]);

  useEffect(() => {
    const anyConnected = clients.some((i) => i.status === ConnectionStatus.Connected);
    props.onStatusChange(anyConnected ? ConnectionStatus.Connected : ConnectionStatus.Disconnected);
  }, [clients, props]);

  useEffect(() => {
    if (isManual && !addedInitialClient.current) {
      addedInitialClient.current = true;
      addTestClient(availableClients[0]); // default Raw client
    }
  }, [availableClients, isManual]);

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    if (isManual) {
      void dataFetcher.invoke("setClientAccessUrl", newUrl);
    }
  };

  const showAddButton = !isManual || clients.length > 0;
  const hasUrl = !!(url ?? "").trim();
  const showHints = isManual && !hasUrl;

  return (
    <div className="d-flex flex-column flex-fill overflow-auto">
      <div className="d-flex flex-column flex-fill" style={{ width: "100%" }}>
          <Dialog open={dialogOpen} onOpenChange={(_, data) => setDialogOpen(!!data.open)}>
            {showAddButton ? (
              <DialogTrigger disableButtonEnhancement>
                <Button className="align-self-start">Add a Test Client</Button>
              </DialogTrigger>
            ) : (
              <span />
            )}
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
                        <CompoundButton
                          className="m-2 w-100"
                          onClick={() => {
                            addTestClient(i);
                            setDialogOpen(false);
                          }}
                          icon={i.icon}
                          secondaryContent={i.description}
                        >
                          {i.title}
                        </CompoundButton>
                      </DialogTrigger>
                    ))}
                  </div>
                </DialogContent>
              </DialogBody>
            </DialogSurface>
          </Dialog>
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
            const panelClass = "flex-fill d-flex flex-column overflow-auto";
            return (
              <div className={panelClass} key={section.id} hidden={section.id !== selectedClient}>
                <ClientComponent
                  allowUrlEdit={isManual}
                  onUrlChange={handleUrlChange}
                  showHints={showHints}
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
    </div>
  );
};
