import { Field, ProgressBar, Switch, Tab, TabList } from "@fluentui/react-components";
import { Icon } from "@fluentui/react/lib/Icon";
import { useEffect, useState } from "react";

import type { TabValue } from "@fluentui/react-components";
import CodeTabs from "../components/CodeTabs";
import { ApiItem, EndpointNav } from "../components/api/EndpointNav";
import { ConnectionStatus } from "../models";
import { useDataContext } from "../providers/DataContext";
import { Method } from "../components/api/Methods";
import { ResizablePanel } from "../components/ResizablePanel";
export interface ServerPanelProps {
  endpoint?: string;
  onChange: (checked: boolean) => Promise<{ success: boolean; message: string }>;
}

export function ServerPanel({ endpoint, onChange }: ServerPanelProps) {
  const { data } = useDataContext();
  const [message, setMessage] = useState<string>();
  const [startEmbeddedServer, setStartEmbeddedServer] = useState<boolean>(data.builtinUpstreamServerStarted);
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.None);
  const [selectedItem, setSelectedItem] = useState<ApiItem>();
  const [selectedPanel, setSelectedPanel] = useState<TabValue>("api");

  useEffect(() => {
    setStartEmbeddedServer(data.builtinUpstreamServerStarted);
  }, [data.builtinUpstreamServerStarted]);

  function onSwitch(checked: boolean) {
    async function onSwitchAsync() {
      if (checked) {
        setStatus(ConnectionStatus.Connecting);
        setMessage("");
        try {
          const result = await onChange(true);
          // only set status when it succeeds
          setStartEmbeddedServer(result.success);
          setMessage(result.message);
          setStatus(ConnectionStatus.Connected);
        } catch (err) {
          setMessage(err?.toString() ?? "");
          setStatus(ConnectionStatus.None);
        }
      } else {
        setStatus(ConnectionStatus.Disconnecting);
        try {
          const result = await onChange(false);
          // only set status when it succeeds
          setStartEmbeddedServer(!result.success);
          setStatus(ConnectionStatus.Disconnected);
          setMessage(result.message);
        } catch (err) {
          setMessage(err?.toString() ?? "");
          setStatus(ConnectionStatus.None);
        }
      }
    }
    onSwitchAsync();
  }

  return (
    <div className="d-flex overflow-auto flex-column flex-fill">
      <TabList className="mb-2" selectedValue={selectedPanel} onTabSelect={(e, data) => {
        setSelectedPanel(data.value)
      }}>
        <Tab id={"server"} value={"server"}>
          <Icon className="mx-2" iconName="TriggerUser"></Icon>
          Handle events</Tab>
        <Tab id={"api"} value={"api"}>
          <Icon className="mx-2" iconName="DecreaseIndentLegacy"></Icon>
          Invoke Web PubSub</Tab>
      </TabList>
      <div className="m-2 overflow-auto d-flex flex-column" hidden={selectedPanel !== "server"}>
        <p>
          <Icon className="mx-2" iconName="ServerEnviroment"></Icon>
          <b>
            Requests are sending to
            {startEmbeddedServer ? " built-in Echo Server." : ` your local server: ${endpoint}`}
          </b>
        </p>
        <Switch
          label={startEmbeddedServer ? "Built-in Echo Server started" : "Built-in Echo Server stopped"}
          checked={startEmbeddedServer}
          disabled={status === ConnectionStatus.Connecting || status === ConnectionStatus.Disconnecting}
          onChange={(ev) => onSwitch(ev.currentTarget.checked)}
        ></Switch>
        {(status === ConnectionStatus.Connecting || status === ConnectionStatus.Disconnecting) && (
          <Field className="m-2" validationMessage={status === ConnectionStatus.Connecting ? "Starting built-in Echo Server" : "Stopping built-in Echo Server"} validationState="none">
            <ProgressBar />
          </Field>
        )}
        <div className="m-2 overflow-auto d-flex flex-column">
          <b>{message}</b>
          <hr></hr>
          <b>📋Sample code handling events in your app server:</b>
          <CodeTabs className="overflow-auto d-flex flex-column"></CodeTabs>
        </div>
      </div>
      <div className="d-flex overflow-auto flex-fill" hidden={selectedPanel !== "api"}>
        <ResizablePanel className="d-flex overflow-auto flex-fill"
          left={<EndpointNav setSelectedItem={setSelectedItem}></EndpointNav>}
          right={selectedItem && <Method method={selectedItem.operation} path={selectedItem.pathUrl}
            methodName={selectedItem.method} />}
        />
      </div>
    </div>
  );
}
