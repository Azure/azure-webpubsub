import 'bootstrap/dist/css/bootstrap.css';
import App from "./App";
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from "react-router-dom";
import { initializeIcons } from "@fluentui/react/lib/Icons";

initializeIcons(/* optional base url */);

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}