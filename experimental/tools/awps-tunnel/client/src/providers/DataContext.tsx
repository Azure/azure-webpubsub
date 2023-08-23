// DataContext.js
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface HttpHistoryItem {
  requestAtOffset: number,
  code: number,
  methodName: string,
  url: string,
  requestRaw: string,
  responseRaw: string,
  unread: boolean,
  id: number
}

export interface LogItem {
  level: LogLevel,
  message: string,
  time: Date,
}

export enum LogLevel {
  Trace,
  Debug,
  Info,
  Warning,
  Error
}

export interface DataModel {
  /** 
   * Whether the data is loaded 
   */
  ready: boolean,
  /** 
   * Endpoint part of the connection string, or the endpoint parameter,
   *  e.g. https://xxx.webpubsub.azure.com 
   */
  endpoint: string,
  /** The hub the tunnel is connecting to
   * each hub is an isolation boudary
   */
  hub: string,
  /** 
   * The generated URL for the WebSocket client to connect to, including the access_token
   * e.g. https://xxx.webpubsub.azure.com/client/hubs/chat?access_token=xxx
   */
  clientUrl: string,
  /** 
   * The Live Trace URL that this Web PubSub service uses, it can be opened in a browser
   */
  liveTraceUrl: string,
  /**
   * The URL of the local server that the tunnel is connecting to
   */
  upstreamServerUrl: string,
  /**
   * The status of the tunnel connections connecting to Web PubSub service
   */
  tunnelConnectionStatus: Status,
  /**
   * The status pair of the HTTP request invoking the local server
   */
  tunnelServerStatus: StatusPair,
  /**
   * The traffic history stored in local storage
   */
  trafficHistory: HttpHistoryItem[],
  /**
   * The logs for current round
   */
  logs: LogItem[]
}

export enum Status {
  Connecting,
  Connected,
  Disconnected
}

export interface StatusPair { statusOut: Status, statusIn: Status }

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useDataContext = (): DataContextType => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

interface DataContextType {
  data: DataModel;
  setData: React.Dispatch<React.SetStateAction<DataModel>>;
}

let id = 0;

function generateMockHttpItem(): HttpHistoryItem {
  return {
    requestAtOffset: Date.now(),
    code: 200,
    methodName: "GET",
    url: "https://www.google.com",
    requestRaw: "ABC",
    responseRaw: "DEF",
    unread: true,
    id: ++id,
  }
}

export const DataProvider: React.FC<{
  children: ReactNode;
}> = ({ children }) => {
  const [data, setData] = useState<DataModel>({
    ready: false,
    clientUrl: "",
    liveTraceUrl: "https://www.google.com",
    endpoint: "https://www.service.com",
    upstreamServerUrl: "https://www.server.com",
    tunnelConnectionStatus: Status.Connected,
    tunnelServerStatus: { statusIn: Status.Disconnected, statusOut: Status.Connected },
    hub: "chat",
    trafficHistory: [
      generateMockHttpItem()
    ],
    logs: [{
      level: LogLevel.Info,
      message: 'This is a log message',
      time: new Date(),
    }]
  });

  useEffect(() => {
    console.log("trafficHistory is updated");
    // when only 50 is loaded, only keep the latest 50 history?
  }, [data.trafficHistory]);

  const fetchData = () => {
    // Perform API call to fetch updated data from the backend
    // Update the data state with the fetched data
    setData(current => {
      const item = generateMockHttpItem();
      return {
        ...current,
        endpoint: "https://www.webpubsub.com",
        clientUrl: "https://www.client.com",
        ready: true, trafficHistory: [item, ...current.trafficHistory]
      };
    });
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <DataContext.Provider value={{ data, setData }}>
      {children}
    </DataContext.Provider>
  );
};

interface IDataFetcher {

}

export class DataFetcher implements IDataFetcher {

}

/*
TODO: update to fetch data from backend

    if (connection) {
      connection.on('updateData', (newItem) => {
        setItems(prevState =>
          [{ ...newItem, unread: true }, ...prevState]);
      });
    }

    const newConnection = new signalR.HubConnectionBuilder()
      .withUrl('/datahub')
      .withAutomaticReconnect()
      .build();

    newConnection
      .start()
      .then(() => {
        console.log('SignalR connection established.');
        setConnected(true);
      })
      .catch((err) => {
        console.log('SignalR connection failed: ', err);
      });

    newConnection.on('Log', (level, time, str, ex) => {
      setLogs((prevLogs) => prevLogs + '\n' + str);
    });

    newConnection.on('ReportLiveTraceUrl', (newLiveTraceUrl) => {
      setLiveTraceUrl(newLiveTraceUrl);
    });

    newConnection.on('ReportServiceEndpoint', (newServiceUrl) => {
      setServiceUrl(newServiceUrl);
    });

    newConnection.on('ReportStatusChange', (newTunnelConnectionStatus) => {
      setTunnelConnectionStatus(newTunnelConnectionStatus);
    });

    newConnection.on('ReportLocalServerUrl', (newLocalUrl) => {
      setUpstreamServerUrl(newLocalUrl);
    });

    newConnection.on('ReportTunnelToLocalServerStatus', (newLocalServerStatus) => {
      setLocalServerStatus(newLocalServerStatus);
    });

    setConnection(newConnection);

    TODO: when to stop the connection?
*/