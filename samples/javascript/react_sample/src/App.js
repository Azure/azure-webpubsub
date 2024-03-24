import logo from "./logo.svg";
import "./App.css";
import { useEffect, useState } from "react";

function App() {
  const [data, setData] = useState("Connecting");

  useEffect(() => {
    let socket;

    async function createConnection() {
      try {
        const response = await fetch("/negotiate?id=userId1");
        const token = await response.json();

        socket = new WebSocket(token.url);

        socket.onopen = () => {
          console.log("WebSocket connected");
          setData("Connected");
        };

        socket.onclose = (event) => {
          console.log("WebSocket closed:", event);
          setData("Connection closed");
        };
      } catch (error) {
        console.error("Error creating WebSocket connection:", error);
        setData("Connection error");
      }
    }

    createConnection();

    // Clean up the WebSocket connection when the component unmounts
    return () => {
      if (socket) {
        socket.onclose = null; // Remove the onclose handler to avoid memory leaks
        socket.close();
      }
    };
  }, []); // Empty dependency array means this effect runs once when the component mounts

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>{data}</p>
      </header>
    </div>
  );
}

export default App;
