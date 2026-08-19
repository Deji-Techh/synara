import { createRoot } from "react-dom/client";
import { CaideMotionProvider } from "./caide-ui";
import App from "./App.tsx";
import "./globals.css";

createRoot(document.getElementById("root")!).render(
  <CaideMotionProvider>
    <App />
  </CaideMotionProvider>,
);
