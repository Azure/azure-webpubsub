import "bootstrap/dist/css/bootstrap.min.css";
import "./CodeInterview.scss";

import { useEffect, useState } from "react";
import { Container } from "./Container";
import { Navigator } from "./Navigator";

function makeId(length) {
  var result = "";
  var characters = "abcdefghijklmnopqrstuvwxyz0123456789";
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export function CodeInterview() {
  const [language, setLanguage] = useState("Typescript");
  const [group, setGroup] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    setUsername(makeId(5));
  }, []);

  useEffect(() => {
    let urlParams = new URLSearchParams(window.location.search);
    let group = urlParams.get("group") ?? "default";
    setGroup(group);
  }, [username]);

  return (
    <div>
      <Navigator
        language={language}
        username={username}
        setLanguage={setLanguage}
      ></Navigator>
      <Container
        language={language.toLowerCase()}
        username={username}
        chanId={group}
      ></Container>
    </div>
  );
}
