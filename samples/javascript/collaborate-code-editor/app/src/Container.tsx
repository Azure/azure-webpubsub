import { useEffect, useState } from "react";
import { Col, Row } from "react-bootstrap";

import { CodeEditor } from "./CodeEditor";

const APP_SERVER_HOST = "http://localhost:8080";

export function Container(props: {
  language: string;
  username: string;
  chanId: string;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let negotiate = async function (group: string): Promise<{ url: string }> {
      let url = `${APP_SERVER_HOST}/sync/negotiate?id=${group}`;
      let res = await fetch(url);
      let data = await res.json();
      return data;
    };

    let connect = async function () {
      let data = await negotiate(props.chanId);
      setUrl(data.url);
    };

    if (props.chanId !== "") {
      connect();
    }
  }, [props.chanId]);

  return (
    <Row className="my-container-row">
      <Col md={12} className="no-padding">
        <CodeEditor
          language={props.language}
          username={props.username}
          chanId={props.chanId}
          url={url}
        />
      </Col>
    </Row>
  );
}
