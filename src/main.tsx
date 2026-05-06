// polyfills MUST be the very first import — sets up Buffer globally
import "./polyfills";
import "./index.css";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find root element");

createRoot(rootElement).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
