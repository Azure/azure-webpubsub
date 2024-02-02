import { useState, useRef, Component, useEffect } from "react";
import { Checkbox, Dropdown, Option, Textarea, Input, Label, Tab, TabList, TabValue, Divider, Field, InfoLabel, LabelProps } from "@fluentui/react-components";
import { DefaultButton, DetailsList, DetailsListLayoutMode, SelectionMode } from "@fluentui/react";
import { ResizablePanel } from "../../components/ResizablePanel";
import { TrafficItem } from "../../components/TrafficItem";
import { ConnectionStatus } from "../../models";
import { MessageBar, MessageBarBody } from "@fluentui/react-components";
import { ClientPannelProps, PlaygroundState } from "../Playground";
import { SendMessageError, WebPubSubClient, WebPubSubJsonProtocol, WebPubSubJsonReliableProtocol } from "@azure/web-pubsub-client";
import { useDataContext } from "../../providers/DataContext";
import { Card, CardFooter, CardHeader, CardPreview } from "@fluentui/react-components";
import { error } from "console";

type SupportedAPIType = "event" | "sendToGroup" | "joinGroup" | "leaveGroup";
interface TrafficItemViewModel {
  content: string;
  up: boolean;
}

interface SupportedAPI {
  key: string;
  name: string;
  component: (props: APIComponentProps) => JSX.Element;
}
// following https://learn.microsoft.com/azure/azure-web-pubsub/reference-json-webpubsub-subprotocol
type JoinGroupAPIParameters = {
  type: "joinGroup";
  group: string;
  ackId?: number;
};
type LeaveGroupAPIParameters = {
  type: "leaveGroup";
  group: string;
  ackId?: number;
};
type SendToGroupAPIParameters = {
  type: "sendToGroup";
  group: string;
  noEcho: boolean;
  fireAndForget: boolean;
  ackId?: number;
  dataType: "text"; // TODO: support other dataType like "json" | "prototype" ?
  data: string;
};

type SendEventAPIParameters = {
  type: "event";
  event: string;
  fireAndForget: boolean;
  ackId?: number;
  dataType: "text"; // TODO: support other dataType like "json" | "prototype" ?
  data: string;
};

type APIParameters = JoinGroupAPIParameters | LeaveGroupAPIParameters | SendToGroupAPIParameters | SendEventAPIParameters;

interface APIComponentProps {
  onMessageChange: (params: APIParameters | undefined) => void;
  onError: (message: string) => void;
}

function getDelimitedArray(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "")
    : [];
}

function InputField({
  required,
  label,
  value,
  placeholder,
  multiline,
  validationMessage,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  multiline?: boolean;
  required?: boolean;
  validationMessage?: string;
  onChange: (ev: any, data: any) => void;
}) {
  return (
    <Field required={required} label={label} orientation="horizontal" validationState={required && !value ? "error" : "none"} validationMessage={required && !value ? validationMessage : ""}>
      {multiline ? <Textarea placeholder={placeholder} onChange={onChange} /> : <Input placeholder={placeholder} onChange={onChange} />}
    </Field>
  );
}

function CheckboxField({ tips, label, onChange }: { tips: string; label: string; onChange: (ev: any, data: any) => void }) {
  return (
    <Field
      orientation="horizontal"
      label={{
        children: <InfoLabel info={tips}>{label}</InfoLabel>,
      }}
    >
      <Checkbox onChange={onChange} />
    </Field>
  );
}

function JoinGroup(props: APIComponentProps) {
  return (
    <div className="d-flex flex-fill flex-column">
      <InputField
        required
        label="Group"
        value=""
        placeholder="Group Name"
        validationMessage="Group name is required."
        onChange={(ev, data) => props.onMessageChange({ type: "joinGroup", group: data.value })}
      />
    </div>
  );
}

function LeaveGroup(props: APIComponentProps) {
  return (
    <div className="d-flex flex-fill flex-column">
      <InputField
        required
        label="Group"
        value=""
        placeholder="Group Name"
        validationMessage="Group name is required."
        onChange={(ev, data) => props.onMessageChange({ type: "leaveGroup", group: data.value })}
      />
    </div>
  );
}

function SendToGroup(props: APIComponentProps) {
  const [name, setName] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [noEcho, setNoEcho] = useState<boolean>(false);
  const [fireAndForget, setFireAndForget] = useState<boolean>(false);

  useEffect(() => {
    if (name && message) {
      // TODO: support other dataType like JSON?
      props.onMessageChange({ type: "sendToGroup", group: name, data: message, dataType: "text", fireAndForget: fireAndForget, noEcho: noEcho });
    } else {
      props.onMessageChange(undefined);
    }
  }, [name, message, props, fireAndForget, noEcho]);

  return (
    <div className="d-flex flex-fill flex-column">
      <InputField required label="Group" value={name} placeholder="Group Name" validationMessage="Group name is required." onChange={(ev, data) => setName(data.value)} />
      <InputField required multiline label="Message" value={message} placeholder="Input the message to send" validationMessage="Message is required." onChange={(ev, data) => setMessage(data.value)} />
      <CheckboxField tips="If checked, this message isn't echoed back to the same connection." label="NoEcho" onChange={(ev, data) => setNoEcho(data.checked === true)} />
      <CheckboxField
        tips="If checked, the message won't contains ackId and no AckMessage will be returned from the service."
        label="FireAndForget"
        onChange={(ev, data) => setFireAndForget(data.checked === true)}
      />
    </div>
  );
}

function SendEvent(props: APIComponentProps) {
  const [name, setName] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [fireAndForget, setFireAndForget] = useState<boolean>(false);

  useEffect(() => {
    if (name && message) {
      // order is a must
      props.onMessageChange({
        type: "event",
        event: name,
        data: message,
        dataType: "text",
        fireAndForget: fireAndForget,
      });
    } else {
      props.onMessageChange(undefined);
    }
  }, [name, message, props, fireAndForget]);

  return (
    <div className="d-flex flex-fill flex-column">
      <InputField required label="Event" value={name} placeholder="Event Name" validationMessage="Event name is required." onChange={(ev, data) => setName(data.value)} />
      <InputField required multiline label="Message" value={message} placeholder="Input the message to send" validationMessage="Message is required." onChange={(ev, data) => setMessage(data.value)} />
      <CheckboxField
        tips="If checked, the message won't contains ackId and no AckMessage will be returned from the service."
        label="FireAndForget"
        onChange={(ev, data) => setFireAndForget(data.checked === true)}
      />
    </div>
  );
}

function ConnectPane({ connected, onSendingMessage, sendError }: { connected: boolean; sendError: string; onSendingMessage: (message: APIParameters) => void }) {
  const [params, setParams] = useState<APIParameters | undefined>(undefined);
  const [message, setMessage] = useState("");

  const supportedAPIs: SupportedAPI[] = [
    { key: "joinGroup", name: "Join Group", component: JoinGroup },
    { key: "leaveGroup", name: "Leave Group", component: LeaveGroup },
    { key: "sendToGroup", name: "Send to Group", component: SendToGroup },
    { key: "sendEvent", name: "Send Event", component: SendEvent },
  ];
  const [selectedAPI, setSelectedAPI] = useState<TabValue>(supportedAPIs[0].key);

  const send = () => {
    if (params) {
      onSendingMessage(params);
    }
  };

  return (
    <>
      <div className="d-flex flex-column flex-fill">
        <b>Supported APIs</b>
        <div className="d-flex flex-row flex-fill">
          <TabList
            defaultSelectedValue={selectedAPI}
            vertical
            onTabSelect={(_, d) => {
              setSelectedAPI(d.value);
            }}
          >
            {supportedAPIs.map((api) => (
              <Tab value={api.key} key={api.key}>
                {api.name}
              </Tab>
            ))}
          </TabList>
          <Card className="d-flex flex-column flex-fill">
            {supportedAPIs.map((api) => {
              if (api.key === selectedAPI) {
                const Component = api.component;
                return (
                  <div key={api.key} className="d-flex flex-fill">
                    <Component
                      onMessageChange={(message) => {
                        if (message) {
                          setParams(message);
                          setMessage(JSON.stringify(message, null, 2));
                        } else {
                          setMessage("");
                        }
                      }}
                      onError={(e) => {
                        setParams(undefined);
                        setMessage("");
                      }}
                    />
                  </div>
                );
              }
            })}
          </Card>
        </div>
        <div className="d-flex flex-column flex-fill">
          <b>Generated payload</b>
          <textarea readOnly className="flex-fill" value={message} />
        </div>
        {sendError && <MessageBar intent="warning">{sendError}</MessageBar>}
        <DefaultButton disabled={!connected || !message} text="Send" onClick={send}></DefaultButton>
      </div>
    </>
  );
}

export const SubprotocolClientSection = ({ onStatusChange, url }: ClientPannelProps) => {
  const transferOptions = [
    { key: "json", text: "JSON", subprotocol: "json.webpubsub.azure.v1" },
    { key: "rjson", text: "Reliable JSON", subprotocol: "json.reliable.webpubsub.azure.v1" },
    //   { key: "binary", text: "Binary" }, // TODO: support binary
  ];
  // url as the default one, adding group permissions need dataFetcher
  const { dataFetcher } = useDataContext();
  const [connected, setConnected] = useState<boolean>(false);
  const [subprotocol, setSubprotocol] = useState<string | undefined>(transferOptions[0].subprotocol);
  const [traffic, setTraffic] = useState<TrafficItemViewModel[]>([]);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const [userId, setUserId] = useState("");
  const [joinLeaveGroups, setJoinLeaveGroups] = useState<string[]>([]);
  const [publishGroups, setPublishGroups] = useState<string[]>([]);
  const [initialGroups, setInitialGroups] = useState<string[]>([]);

  const connectionRef = useRef<WebPubSubClient | null>(null);

  const disconnect = () => {
    onStatusChange(ConnectionStatus.Disconnected);
    setConnected(false);
    connectionRef.current?.stop();
    return true;
  };
  const connect = async () => {
    const connection = new WebPubSubClient(
      {
        getClientAccessUrl: async () => {
          if (joinLeaveGroups.length === 0 && publishGroups.length === 0) {
            return url; // url is updated in the data provider
          }
          const roles = joinLeaveGroups.map((s) => `webpubsub.joinLeaveGroup.${s}`).concat(publishGroups.map((s) => `webpubsub.sendToGroup.${s}`));
          // elsewise, we need to add group permissions
          return dataFetcher.invoke("getClientAccessUrl", userId, roles, initialGroups);
        },
      },
      {
        protocol: subprotocol === transferOptions[0].subprotocol ? WebPubSubJsonProtocol() : WebPubSubJsonReliableProtocol(),
      },
    );

    // Registers a listener for the "server-message". The callback will be invoked when your application server sends message to the connectionID, to or broadcast to all connections.
    connection.on("server-message", (e) => {
      console.log(`Received message ${e.message.data}`);
      // TODO: data could be ArrayBuffer or JSONTypes
      setTraffic((t) => [{ content: e.message.data.toString(), up: false }, ...t]);
    });

    // Registers a listener for the "group-message". The callback will be invoked when the client receives a message from the groups it has joined.
    connection.on("group-message", (e) => {
      setTraffic((t) => [{ content: e.message.data.toString(), up: false }, ...t]);
      console.log(`Received message from ${e.message.group}: ${e.message.data}`);
    });
    try {
      await connection.start();
      setConnected(true);
      onStatusChange(ConnectionStatus.Connected);
      connectionRef.current = connection;
    } catch (e) {
      setConnected(false);
      onStatusChange(ConnectionStatus.Disconnected);
      console.error(e);
      setTraffic([]);
      setError(`Error establishing the connection ${(e as Error).message}`);
    }
  };

  const send = async (message: APIParameters) => {
    setSendError("");
    if (!connectionRef.current) {
      setSendError("Connection is not yet connected");
      console.error("Connection is not connected");
      return;
    }
    try {
      switch (message.type) {
        case "joinGroup":
          const joinGroup = message as JoinGroupAPIParameters;
          await connectionRef.current.joinGroup(joinGroup.group, {
            ackId: joinGroup.ackId,
          });
          break;
        case "leaveGroup":
          const leaveGroup = message as LeaveGroupAPIParameters;
          await connectionRef.current.leaveGroup(leaveGroup.group, {
            ackId: leaveGroup.ackId,
          });
          break;
        case "sendToGroup":
          const sendToGroup = message as SendToGroupAPIParameters;
          await connectionRef.current.sendToGroup(sendToGroup.group, sendToGroup.data, sendToGroup.dataType, {
            noEcho: sendToGroup.noEcho,
            fireAndForget: sendToGroup.fireAndForget,
            ackId: sendToGroup.ackId,
          });
          break;
        case "event":
          const sendEvent = message as SendEventAPIParameters;
          await connectionRef.current.sendEvent(sendEvent.event, sendEvent.data, sendEvent.dataType, {
            fireAndForget: sendEvent.fireAndForget,
            ackId: sendEvent.ackId,
          });
          break;
      }
      setTraffic((e) => [{ content: JSON.stringify(message), up: true }, ...e]);
    } catch (e) {
      if (e instanceof SendMessageError) {
        setSendError(`Error sending message: ${(e as SendMessageError).errorDetail?.message}`);
      } else {
        setSendError(`Error sending message: ${(e as Error).message}`);
      }
    }
  };

  const trafficList = traffic?.map((i) => TrafficItem(i));
  const trafficPane = (
    <div>
      <DetailsList items={trafficList} selectionMode={SelectionMode.none} layoutMode={DetailsListLayoutMode.justified}></DetailsList>
    </div>
  );
  return (
    <>
      <div className="d-flex flex-row">
        {!connected && (
          <Dropdown
            placeholder="Select the supported subprotocol"
            onOptionSelect={(e, d) => {
              setSubprotocol(d.optionValue);
            }}
            defaultValue={transferOptions[0].text}
          >
            {transferOptions.map((option) => (
              <Option key={option.key} value={option.subprotocol}>
                {option.text}
              </Option>
            ))}
          </Dropdown>
        )}
        <Input className="flex-fill" readOnly={true} placeholder="Loading" value={url}></Input>
      </div>
      {url && !connected && (
        <Card className="w-100">
          <CardHeader header={<b>Advanced Settings</b>}></CardHeader>
          <CardPreview>
            <div className="d-flex flex-column">
              <div>
                <b className="m-3">Connect with</b>
                <Label htmlFor="userIdInput" style={{ paddingInline: "12px" }}>
                  User ID
                </Label>
                <Input id="userIdInput" placeholder="(Empty User ID)" onChange={(ev, data) => setUserId(data.value)} />
                <Label htmlFor="initialGroupsInput" style={{ paddingInline: "12px" }}>
                  Groups
                </Label>
                <Input id="initialGroupsInput" placeholder="Use comma(,) to separate" onChange={(ev, data) => setInitialGroups(getDelimitedArray(data.value))} />
              </div>
              <div>
                <b className="m-3">Permissions</b>
                <Label htmlFor="joinLeaveGroupInput" style={{ paddingInline: "12px" }}>
                  Allow join or leave groups
                </Label>
                <Input id="joinLeaveGroupInput" placeholder="Use comma(,) to separate" onChange={(ev, data) => setJoinLeaveGroups(getDelimitedArray(data.value))} />
                <Label htmlFor="publishGroupInput" style={{ paddingInline: "12px" }}>
                  Allow send to groups
                </Label>
                <Input id="publishGroupInput" placeholder="Use comma(,) to separate" onChange={(ev, data) => setPublishGroups(getDelimitedArray(data.value))} />
              </div>
            </div>
          </CardPreview>
          <CardFooter>
            <DefaultButton disabled={!subprotocol} className="flex-right" onClick={connect}>
              Connect
            </DefaultButton>
          </CardFooter>
        </Card>
      )}

      {url && connected && (
        <Card>
          <CardHeader header={<b>Connected With</b>}></CardHeader>
          <CardPreview>
            <div>
              <b className="m-3">
                Subprotocol <code>{subprotocol}</code>
              </b>
              <b className="m-3">User ID:</b> <code>{userId ? userId : "(Anonymous)"}</code>
              <b className="m-3">Initially joined groups: </b> <code>{initialGroups.length > 0 ? initialGroups.join(", ") : "(None)"}</code>
              <b className="m-3">Allowed to join or leave groups: </b> <code>{joinLeaveGroups.length > 0 ? joinLeaveGroups.join(", ") : "(None)"}</code>
              <b className="m-3">Allowed to send to groups: </b> <code>{publishGroups.length > 0 ? publishGroups.join(", ") : "(None)"}</code>
            </div>
          </CardPreview>
          <CardFooter>
            <DefaultButton className="flex-right" onClick={disconnect}>
              Disconnect
            </DefaultButton>
          </CardFooter>
        </Card>
      )}
      {error && <b className="text-danger">{error}</b>}
      <MessageBar>Press F12 to view the real network traffic flow</MessageBar>
      {connected && <ResizablePanel className="flex-fill" left={<ConnectPane sendError={sendError} connected={connected} onSendingMessage={send}></ConnectPane>} right={trafficPane}></ResizablePanel>}
    </>
  );
};
