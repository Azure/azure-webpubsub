import 'bootstrap/dist/css/bootstrap.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import reportWebVitals from './reportWebVitals';
import { initializeIcons } from '@fluentui/react/lib/Icons';
const baseHref = document.getElementsByTagName('base')[0].getAttribute('href') || '/';
const baseUrl = new URL(baseHref, window.location.href).pathname.replace(/\/+$/, '') || '/';
const routerBase = baseUrl === '' ? '/' : baseUrl;
const rootElement = document.getElementById('root');
const root = createRoot(rootElement);
initializeIcons(/* optional base url */);
root.render(
  <BrowserRouter basename={routerBase}>
      <App />
  </BrowserRouter>
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
serviceWorkerRegistration.unregister();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
