import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DashboardProvider } from "./hub/DashboardProvider";
import { Hub } from "./hub/Hub";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DashboardProvider>
      <Hub />
    </DashboardProvider>
  </StrictMode>,
);
