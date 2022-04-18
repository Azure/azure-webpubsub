import "bootstrap/dist/css/bootstrap.min.css";
import "./CodeInterview.scss";

import { useEffect, useState } from "react";
import { Container } from "./Container";
import { Navigator } from "./Navigator";

export function CodeInterview() {
  const [language, setLanguage] = useState("Typescript");
  const [group, setGroup] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    let person = prompt("Please enter your name", "Anonymous");
    setUsername(person || "Anonymous");
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
