import { useRef } from "react";
import * as signalR from "@microsoft/signalr";
import { useImmer } from "use-immer";
import { ConnectionStatus } from "../models";
import {
  Tooltip,
  TableColumnSizingOptions,
  DataGridBody,
  DataGridRow,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridCell,
  TableCellLayout,
  TableColumnDefinition,
  createTableColumn,
} from "@fluentui/react-components";
import { StatusIndicator } from "./workflows/StatusIndicator";

function LiveTraceGrid(props: { headers: Record<string, string>; items: LogDataViewModel[] }) {
  // record key as columnId, value as column name
  function columns(items: Record<string, string>): TableColumnDefinition<LogDataViewModel>[] {
    return Object.entries(items).map(([key, value]) =>
      createTableColumn<LogDataViewModel>({
        columnId: key,
        compare: (a, b) => {
          return (a.columns[key] ?? "").localeCompare(b.columns[key] ?? "");
        },
        renderHeaderCell: () => {
          return value;
        },
        renderCell: (item) => {
          const content = item.columns[key];
          // showing tooltip if content is long
          return (
            <TableCellLayout truncate>
              {content?.length > 18 ? (
                <Tooltip positioning="above-start" content={content} relationship="description">
                  <span>{content}</span>
                </Tooltip>
              ) : (
                <>{content}</>
              )}
            </TableCellLayout>
          );
        },
      }),
    );
  }

  function countColumns(items: Record<string, string>): number {
    const width = (Object.keys(items).length + 4) * 200;
    return width;
  }

  function columnSizingOptions(items: Record<string, string>): TableColumnSizingOptions {
    let options: TableColumnSizingOptions = {};
    for (const key in items) {
      options[key] = {
        defaultWidth: 200,
        minWidth: 150,
        idealWidth: 250,
      };
    }
    return options;
  }

  return (
    <div style={{ overflowX: "auto", width: countColumns(props.headers) }}>
      <DataGrid items={props.items} columns={columns(props.headers)} sortable resizableColumns columnSizingOptions={columnSizingOptions(props.headers)} focusMode="composite">
        <DataGridHeader>
          <DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow>
        </DataGridHeader>
        <DataGridBody<LogDataViewModel>>
          {({ item }) => <DataGridRow<LogDataViewModel> key={item.eventId.toString()}>{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}</DataGridRow>}
        </DataGridBody>
      </DataGrid>
    </div>
  );
}

enum LogLevel {
  Trace,
  Debug,
  Information,
  Warning,
  Error,
  Critical,
  None,
}

interface LiveTraceLogProperty {
  eventId: number;
  eventName: string;
  template: string;
  logLevel: LogLevel;
}

// time, eventId, eventName, logContext as columns, template + value, exceptionMessage
interface LiveTraceLogData {
  time: string;
  eventId: number;
  /**
   * This field provides the additional information useful for the log item.
   */
  logContext: Record<string, string>;
  /**
   *  This field is used to fill the log message's template.
   */
  values: string[];
  /**
   * This field is the exception message that includes in the log item if any.
   */
  exceptionMessage: string | undefined;
}

interface LogDataViewModel {
  columns: Record<string, string>;
  data: LiveTraceLogData;
  eventId: number;
}

interface StatusDetail {
  status: ConnectionStatus;
  message: string;
  level: LogLevel;
}

export function LiveTraceSection({ url, tokenGenerator }: { url: string; tokenGenerator(): Promise<string> }) {
  const connectionRef = useRef<signalR.HubConnection | undefined>(undefined);
  const logProps: Record<number, LiveTraceLogProperty> = {};

  const [logItems, updateLogItems] = useImmer<LogDataViewModel[]>([]);
  const [headers, updateHeaders] = useImmer<Record<string, string>>({
    time: "Time",
    eventId: "EventId",
    eventName: "EventName",
    message: "Event", // template + value
    // + dynamic logContext as columns
    // + exception as column if exceptionMessage is not empty
  });

  function getViewModel(data: LiveTraceLogData, template: LiveTraceLogProperty | undefined): LogDataViewModel {
    const model: LogDataViewModel = {
      data: data,
      columns: {
        ...data.logContext,
        time: data.time,
        eventId: data.eventId.toString(),
      },
      eventId: data.eventId,
    };
    if (data.exceptionMessage) {
      // only add exception column when needed
      model.columns["exception"] = data.exceptionMessage;
    }

    // if template is yet undefined, placeholding the message
    if (template) {
      updateViewModel(model, template);
    }

    return model;
  }

  function updateViewModel(model: LogDataViewModel, template: LiveTraceLogProperty): void {
    model.columns.eventName = template.eventName;
    model.columns.message = template.template.replace(/{(\w+)}/g, (match) => {
      return model.data.values.shift() ?? match;
    });
  }

  function updateColumnHeaders(data: LiveTraceLogData) {
    // update header incase new column is added from logContext
    updateHeaders((h) => {
      Object.entries(data.logContext).forEach(([key, _]) => {
        if (!h[key]) {
          // display name is the key
          h[key] = key;
        }
      });
    });
  }

  const [status, updateStatus] = useImmer<StatusDetail>({ status: ConnectionStatus.Disconnected, message: "", level: LogLevel.None });

  const connect = () => {
    if (connectionRef.current) {
      return connectionRef.current;
    }

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(url, {
        accessTokenFactory: tokenGenerator,
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: () => 3000,
      })
      .configureLogging(signalR.LogLevel.Information)
      .build();

    const startListeningToLogEvents = () => {
      connection.send("startListeningToLogEvents").catch((err) => {
        console.error(err);
      });
    };
    connectionRef.current = connection;

    connection.on("logEvent", (logEvent: LiveTraceLogData) => {
      const template = logProps[logEvent.eventId];
      if (!template) {
        // get messageTemplate from logProps and show the log item
        connection.send("LogProperty", logEvent.eventId);
      }
      // incase logcontext contains more columns
      updateColumnHeaders(logEvent);
      // request for messageTemplate and then render the log item
      updateLogItems((i) => {
        i.unshift(getViewModel(logEvent, template));
      });
    });

    connection.on("LogProperty", (props: LiveTraceLogProperty) => {
      // only set when the event template is not yet set
      if (!logProps[props.eventId]) {
        logProps[props.eventId] = props;
        updateLogItems((i) => {
          const item = i.find((a) => a.eventId === props.eventId);
          if (item) {
            updateViewModel(item, props);
          }
        });
      }
    });
    connection.onclose((err) => {
      console.error(err);
      updateStatus((s) => {
        s.status = ConnectionStatus.Disconnected;
        s.message = err ? err.message : "Connection closed";
        s.level = LogLevel.Error;
      });
    });
    connection.onreconnected(() => {
      updateStatus((s) => {
        s.status = ConnectionStatus.Connected;
        s.message = "Connection reconnected";
        s.level = LogLevel.Information;
      });
    });
    connection
      .start()
      .then(() => {
        console.log("Connected, start listening to live traces");
        startListeningToLogEvents();
        updateStatus((s) => {
          s.status = ConnectionStatus.Connected;
          s.message = "Connected, start listening to live traces";
          s.level = LogLevel.Information;
        });
      })
      .catch((err) => {
        console.error(err);
        updateStatus((s) => {
          s.status = ConnectionStatus.Disconnected;
          s.message = err ? err.message : "Connection closed";
          s.level = LogLevel.Error;
        });
      });
  };

  connect();

  return (
    <>
      <div className="m-2">
        Status: <StatusIndicator status={status.status}></StatusIndicator> {status.message}
      </div>
      <LiveTraceGrid headers={headers} items={logItems} />
    </>
  );
}
