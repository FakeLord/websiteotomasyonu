import React from "react";
import ReactDOM from "react-dom/client";
import { platform } from "./lib/platform";
import App from "./App";
import "./index.css";

platform.attachLogs();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
