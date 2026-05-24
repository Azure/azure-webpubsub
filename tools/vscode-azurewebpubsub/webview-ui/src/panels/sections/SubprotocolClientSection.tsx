import "./SubprotocolClientSection.css"
import { useState, useRef, useEffect } from "react";
import { type TabValue } from "@fluentui/react-components";
import { Checkbox, Dropdown, Option, Label, Tab, TabList, Field, InfoLabel, MessageBar } from "@fluentui/react-components";
import { ResizablePanel } from "../../components/ResizablePanel";
import { type TrafficItemViewModel } from "../../components/TrafficItem";
import { TrafficItem } from "../../components/TrafficItem";
import { ConnectionStatus } from "../../models";
import { type ClientPannelProps } from "../Playground";
import { SendMessageError, WebPubSubClient, WebPubSubJsonProtocol, WebPubSubJsonReliableProtocol } from "@azure/web-pubsub-client";
import { useDataContext } from "../../providers/DataContext";
import { Card } from "@fluentui/react-components";
import { VSCodeBadge, VSCodeButton, VSCodeCheckbox, VSCodeDataGrid, VSCodeDataGridCell, VSCodeDataGridRow, VSCodeDivider, VSCodeTextArea, VSCodeTextField } from "@vscode/webview-ui-toolkit/react";

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
  onChange: (ev: any) => void;
}) {
  const [init, setInit] = useState(true);
  useEffect(() => {
    // disable validation check when the component is first mounted
    if (value && init) {
      setInit(false);
    }
  }, [value, init]);
  return (
    <Field
      required={required}
      label={label}
      orientation="horizontal"
      validationState={!init && required && !value ? "error" : "none"}
      validationMessage={!init && required && !value ? validationMessage : ""}
    >
      {multiline ? <VSCodeTextArea placeholder={placeholder} onChange={onChange} /> : <VSCodeTextField placeholder={placeholder} onChange={onChange} />}
    </Field>
  );
}

function CheckboxField({ tips, label, onChange }: { tips: string; label: string; onChange: (ev: any) => void }) {
  return (
    <Field
      orientation="horizontal"
      label={{
        children: <InfoLabel info={tips}>{label}</InfoLabel>,
      }}
    >
      <VSCodeCheckbox onChange={onChange} />
    </Field>
  );
}

function JoinGroup(props: APIComponentProps) {
  const [name, setName] = useState<string>("");
  useEffect(() => {
    if (name) {
      props.onMessageChange({ type: "joinGroup", group: name });
    } else {
      props.onMessageChange(undefined);
    }
  }, [name, props]);
  return (
    <div className="d-flex flex-fill flex-column">
      <InputField required label="Group" value={name} placeholder="Group Name" validationMessage="Group name is required." onChange={(ev) => setName((ev.target as any).value)} />
    </div>
  );
}

function LeaveGroup(props: APIComponentProps) {
  const [name, setName] = useState<string>("");
  useEffect(() => {
    if (name) {
      props.onMessageChange({ type: "leaveGroup", group: name });
    } else {
      props.onMessageChange(undefined);
    }
  }, [name, props]);
  return (
    <div className="d-flex flex-fill flex-column">
      <InputField required label="Group" value={name} placeholder="Group Name" validationMessage="Group name is required." onChange={(ev) => setName((ev.target as any).value)} />
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
      <InputField required label="Group" value={name} placeholder="Group Name" validationMessage="Group name is required." onChange={(ev) => setName((ev.target as any).value)} />
      <InputField required multiline label="Message" value={message} placeholder="Input the message to send" validationMessage="Message is required." onChange={(ev) => setMessage((ev.target as any).value)} />
      <CheckboxField tips="If checked, this message isn't echoed back to the same connection." label="NoEcho" onChange={(ev) => setNoEcho((ev.target as any).checked === true)} />
      <CheckboxField
        tips="If checked, the message won't contains ackId and no AckMessage will be returned from the service."
        label="FireAndForget"
        onChange={(ev) => setFireAndForget((ev.target as any).checked === true)}
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
      <InputField required label="Event" value={name} placeholder="Event Name" validationMessage="Event name is required." onChange={(ev) => setName((ev.target as any).value)} />
      <InputField required multiline label="Message" value={message} placeholder="Input the message to send" validationMessage="Message is required." onChange={(ev) => setMessage((ev.target as any).value)} />
      <CheckboxField
        tips="If checked, the message won't contains ackId and no AckMessage will be returned from the service."
        label="FireAndForget"
        onChange={(ev) => setFireAndForget((ev.target as any).checked === true)}
      />
    </div>
  );
}

const supportedAPIs: SupportedAPI[] = [
  { key: "sendToGroup", name: "Send to Group", component: SendToGroup },
  { key: "sendEvent", name: "Send Event", component: SendEvent },
  { key: "joinGroup", name: "Join Group", component: JoinGroup },
  { key: "leaveGroup", name: "Leave Group", component: LeaveGroup },
];

function ConnectPane({ connected, onSendingMessage, sendError }: { connected: boolean; sendError: string; onSendingMessage: (message: APIParameters) => void }) {
  const [params, setParams] = useState<APIParameters | undefined>(undefined);
  const [message, setMessage] = useState("");
  const [selectedAPI, setSelectedAPI] = useState<TabValue>(supportedAPIs[0].key);

  const send = () => {
    if (params) {
      onSendingMessage(params);
    }
  };

  return (
    <div className="d-flex flex-column flex-fill overflow-auto">
      <VSCodeDivider />
      <b>Supported APIs</b>
      <div className="d-flex flex-row flex-fill overflow-auto">
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
            } else return <></>;
          })}
        </Card>
      </div>

      <VSCodeDivider />

      <div className="d-flex flex-column flex-fill m-2">
        <div className="d-flex flex-row m-2">
          <b>Generated payload</b>
        </div>

        <div className="d-flex flex-row m-2">
          <VSCodeTextArea readOnly value={message} className="flex-fill" rows={8} />
        </div>
      </div>
      {sendError && <MessageBar intent="warning">{sendError}</MessageBar>}
      <VSCodeButton disabled={!connected || !message} onClick={send}> Send </VSCodeButton>
    </div>
  );
}

export const SubprotocolClientSection = ({ onStatusChange, url, hubName }: ClientPannelProps) => {
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
    setTraffic([]);
    setError("");
    setSendError("");
    setUserId("");
    setJoinLeaveGroups([]);
    setPublishGroups([]);
    setInitialGroups([]);

    connectionRef.current?.stop();
    return true;
  };
  const connect = async () => {
    // clear the state before start
    setError("");
    setSendError("");
    setTraffic([]);

    const connection = new WebPubSubClient(
      {
        getClientAccessUrl: async () => {
          if (joinLeaveGroups.length === 0 && publishGroups.length === 0) {
            return url; // url is updated in the data provider
          }
          const roles = joinLeaveGroups.map((s) => `webpubsub.joinLeaveGroup.${s}`).concat(publishGroups.map((s) => `webpubsub.sendToGroup.${s}`));
          return dataFetcher.invoke("getClientAccessUrl", {
            hub: hubName, userId: userId, roles: roles, groups: initialGroups
          });
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
      setTraffic((t) => [TrafficItem(JSON.stringify(e.message.data)), ...t]);
    });

    // Registers a listener for the "group-message". The callback will be invoked when the client receives a message from the groups it has joined.
    connection.on("group-message", (e) => {
      setTraffic((t) => [TrafficItem(JSON.stringify(e.message)), ...t]);
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
      setTraffic((e) => [TrafficItem(JSON.stringify(message), true), ...e]);
    } catch (e) {
      if (e instanceof SendMessageError) {
        setSendError(`Error sending message: ${(e as SendMessageError).errorDetail?.message}`);
      } else {
        setSendError(`Error sending message: ${(e as Error).message}`);
      }
    }
  };

  const trafficPane = (
    <div>
      <VSCodeDataGrid>
        <VSCodeDataGridRow row-type="header">
          <VSCodeDataGridCell cell-type="columnheader" grid-column="1"> Data </VSCodeDataGridCell>
          <VSCodeDataGridCell cell-type="columnheader" grid-column="2"> Time </VSCodeDataGridCell>
          <VSCodeDataGridCell cell-type="columnheader" grid-column="3"> Length </VSCodeDataGridCell>
        </VSCodeDataGridRow>
        {traffic.map(row => (
          <VSCodeDataGridRow>
            <VSCodeDataGridCell grid-column="1">{row.Data}</VSCodeDataGridCell>
            <VSCodeDataGridCell grid-column="2">{row.Time}</VSCodeDataGridCell>
            <VSCodeDataGridCell grid-column="3">{row.Length}</VSCodeDataGridCell>
          </VSCodeDataGridRow>
        ))}
      </VSCodeDataGrid>
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
        <VSCodeTextField className="flex-fill" readOnly={true} placeholder="Loading" value={url}></VSCodeTextField>
      </div>
      {url && !connected && (
        <div>
          <b>Advanced Settings</b>
          <div className="d-flex flex-column">
            <div>
              <b className="m-3">Connect with</b>
              <Label htmlFor="userIdInput" style={{ paddingInline: "12px" }}>
                User ID
              </Label>
              <VSCodeTextField id="userIdInput" placeholder="(Empty User ID)" onChange={(ev) => setUserId((ev.target as any).value)} />

              <Label htmlFor="initialGroupsInput" style={{ paddingInline: "12px" }}>
                Groups
              </Label>
              <VSCodeTextField id="initialGroupsInput" placeholder="Use comma(,) to separate" onChange={(ev) => setInitialGroups(getDelimitedArray((ev.target as any).value))} />
            </div>
            <div>
              <b className="m-3">Permissions</b>
              <Label htmlFor="joinLeaveGroupInput" style={{ paddingInline: "12px" }}>
                Allow join or leave groups
              </Label>
              <VSCodeTextField id="joinLeaveGroupInput" placeholder="Use comma(,) to separate" onChange={(ev) => setJoinLeaveGroups(getDelimitedArray((ev.target as any).value))} />
              <Label htmlFor="publishGroupInput" style={{ paddingInline: "12px" }}>
                Allow send to groups
              </Label>
              <VSCodeTextField id="publishGroupInput" placeholder="Use comma(,) to separate" onChange={(ev) => setPublishGroups(getDelimitedArray((ev.target as any).value))} />
            </div>
          </div>
          <VSCodeButton disabled={!subprotocol} className="flex-right" onClick={connect}>
            Connect
          </VSCodeButton>
        </div>
      )}

      <VSCodeDivider />

      {url && connected && (
        <div>
          <MessageBar>Press Ctrl+Shift+P and click "Developer: Toggle Developer Tools" to view the real network traffic flow</MessageBar>
          <VSCodeDivider />
          <b>Connected With</b>
          <div>
            <b className="m-3">
              Subprotocol <VSCodeBadge>{subprotocol}</VSCodeBadge>
            </b>
            <b className="m-3">User ID: </b> <VSCodeBadge>{userId ? userId : "Anonymous"}</VSCodeBadge>
            <b className="m-3">Initially joined groups: </b> <VSCodeBadge>{initialGroups.length > 0 ? initialGroups.join(", ") : "None"}</VSCodeBadge>
            <b className="m-3">Allowed to join or leave groups: </b> <VSCodeBadge>{joinLeaveGroups.length > 0 ? joinLeaveGroups.join(", ") : "None"}</VSCodeBadge>
            <b className="m-3">Allowed to send to groups: </b> <VSCodeBadge>{publishGroups.length > 0 ? publishGroups.join(", ") : "None"}</VSCodeBadge>
          </div>
          <div>
            <VSCodeButton className="flex-right" onClick={disconnect}>
              Disconnect
            </VSCodeButton>
          </div>
        </div>
      )}
      {error && <b className="text-danger">{error}</b>}
      {(connected) && <ResizablePanel className="flex-fill" left={<ConnectPane sendError={sendError} connected={connected} onSendingMessage={send}></ConnectPane>} right={trafficPane}></ResizablePanel>}
    </>
  );
};
