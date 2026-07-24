import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { KernContextProvider } from "@kern-ux-annex/kern-react-kit";
import { registerSW } from "virtual:pwa-register";

// Required KERN styling, imported once for the whole app.
import "@kern-ux/native/dist/kern.min.css";
import "@kern-ux/native/dist/fonts/fira-sans.css";

import { App } from "./App.tsx";

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    window.setInterval(
      () => void registration.update(),
      60 * 60 * 1000,
    );
  },
});

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

createRoot(container).render(
  <StrictMode>
    <KernContextProvider>
      <App />
    </KernContextProvider>
  </StrictMode>,
);
