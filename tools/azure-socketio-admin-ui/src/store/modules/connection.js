import { isLocalStorageAvailable } from "../../util";

export default {
  namespaced: true,
  state: {
    serviceEndpoint: "",
    wsOnly: false,
    path: "/socket.io",
    namespace: "/admin",
    parser: "default",
    sessionId: "",
    connected: false,
  },
  mutations: {
    init(state) {
      if (isLocalStorageAvailable) {
        state.serviceEndpoint = localStorage.getItem("server_url") || "";
        if (state.serviceEndpoint.endsWith("/admin")) {
          // for backward compatibility
          state.serviceEndpoint = state.serviceEndpoint.slice(0, -6);
        } else {
          state.namespace = localStorage.getItem("namespace") || "/admin";
        }
        state.wsOnly = localStorage.getItem("ws_only") === "true";
        state.sessionId = localStorage.getItem("session_id");
        state.path = localStorage.getItem("path") || "/socket.io";
        state.parser = localStorage.getItem("parser") || "default";
      }
    },
    saveConfig(state, { serviceEndpoint, wsOnly, path, namespace, parser }) {
      state.serviceEndpoint = serviceEndpoint;
      state.wsOnly = wsOnly;
      state.path = path;
      state.namespace = namespace;
      state.parser = parser;
      if (isLocalStorageAvailable) {
        localStorage.setItem("server_url", serviceEndpoint);
        localStorage.setItem("ws_only", wsOnly);
        localStorage.setItem("path", path);
        localStorage.setItem("namespace", namespace);
        localStorage.setItem("parser", parser);
      }
    },
    saveSessionId(state, sessionId) {
      state.sessionId = sessionId;
      if (isLocalStorageAvailable) {
        localStorage.setItem("session_id", sessionId);
      }
    },
    connect(state) {
      state.connected = true;
    },
    disconnect(state) {
      state.connected = false;
    },
  },
};
