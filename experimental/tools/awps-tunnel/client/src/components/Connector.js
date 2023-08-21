import React from 'react';
import './Connector.css';

export function Connector({ status }) {

  if (status === "Connecting") {
    return <div className="dashed-line arrow-line connecting"></div>
  }

  if (status === "Connected") {
    return <div className="arrow-line connected"></div>;
  }

  return <div className="dashed-line arrow-line"></div>
}

export function TwoDirectionConnector({ status }) {
  if (status === "Succeed") {
  return <div className="two-direction-arrow-line connected"></div>;
  }

  if (status === "RequestFailed" || status === "RequestTimeout") {
    return <div className="two-direction-arrow-line requesterror"></div>;
  }

  if (status === "ErrorResponse") {
    return <div className="two-direction-arrow-line responseerror"></div>;
  }

  return <div className="two-direction-arrow-line dashed-line"></div>;
}