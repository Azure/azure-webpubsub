import React from 'react';
import './Connector.css';
import { Status, StatusPair } from '../providers/DataContext';

export function Connector({ status }: { status: Status }) {

  if (status === Status.Connecting) {
    return <div className="dashed-line arrow-line connecting"></div>
  }

  if (status === Status.Connected) {
    return <div className="arrow-line connected"></div>;
  }

  return <div className="dashed-line arrow-line"></div>
}

export function TwoDirectionConnector({ statusPair }: { statusPair: StatusPair }) {
  if (statusPair.statusOut === Status.Connected && statusPair.statusIn === Status.Connected) {
    return <div className="two-direction-arrow-line connected"></div>;
  }

  if (statusPair.statusOut === Status.Disconnected) {
    return <div className="two-direction-arrow-line requesterror"></div>;
  }

  if (statusPair.statusOut === Status.Connected && statusPair.statusIn === Status.Disconnected) {
    return <div className="two-direction-arrow-line responseerror"></div>;
  }

  return <div className="two-direction-arrow-line dashed-line"></div>;
}